// Bug 0280 — a `tools:` ROOT must not register over a child whose own `tools:`
// names a PROMPT-mode grandchild, and which the same load pass therefore
// un-registers.
//
// Standalone live registration cell (the standalone-live-file precedent of
// `tests/live/unterminated-template-registration-live-cell.test.ts`,
// `tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts`,
// `tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts` and
// `tests/live/b0275live-escaping-tools-entry-below-immediate-callee-live-cell.test.ts`,
// which this file mirrors; this lane's parent renumbers the H8a sequence of
// `tests/live/live-production-acceptance.test.ts` at merge, so this file carries
// no numeric id from that file's own cell sequence and moves no cell in it).
//
// TIER: H8a (live). The fixed surface is a REGISTRATION OUTCOME two `tools:`
// levels deep, and that outcome is only fully observable after real discovery →
// real load → the real `pi.registerCommand` step of the shipped composition
// root over real on-disk discovery roots. The offline witness
// (`tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts`, five
// cells over §Reproduction rows A–E) reads `wiring.thetas` off
// `composeExtensionInstance` driven over host doubles, so its `pi` is a double
// whose `registerCommand` records nothing: it cannot show that the root never
// becomes an author-runnable slash command on a real `ExtensionRunner`, and it
// drives no model turn, so it cannot show that the widened deep verdict leaves a
// healthy three-level chain able to run. Those two claims are what this cell
// adds, and neither the unit nor an integration tier reaches them — an
// integration tier would still stub the runner and the provider, which are
// exactly the two things under observation.
//
// WHAT THE CELL OBSERVES. Two boots over two workspaces that plant the SAME four
// files; their `.theta` bytes differ in ONE frontmatter line — the GRANDCHILD's
// declared `mode:`.
//
//   (1) THE REFUSAL. `b0280scratchroot.theta` is `mode: prompt` and its `tools:`
//       names `b0280scratchchild.theta`, a `mode: subagent` child whose own
//       `tools:` names `./b0280scratchgrand.theta` — a `mode: prompt` file.
//       `docs/spec_topics/frontmatter/frontmatter-fields-a.md`, line 79, makes a
//       `tools:` `.theta` entry pointing at a prompt-mode theta
//       `theta/load/prompt-mode-callable`, and
//       `docs/spec_topics/diagnostics/code-registry-load.md`, line 30, carries
//       that row at error severity on the load phase. That is a structural check
//       of the file DECLARING the entry, so the row sits at the CHILD's own
//       file. `docs/spec_topics/invocation.md` §Static resolution, line 20, then
//       states the composition this bug's fix landed: "A `.theta` path's own
//       declared mode is judged at every depth of this walk … that failure
//       composes into `theta/load/callee-has-errors` at every caller above that
//       immediate caller, however far below such a caller the prompt-mode entry
//       sits." Line 22 fixes the consequence at each `tools:` edge above it:
//       "the callable cannot be created, and the parent theta does not
//       register". PRE-FIX the root registered anyway, carrying no row of its
//       own, with a frozen `child` entry byte-identical to the healthy control's
//       — no caller-side observable separated the two. POST-FIX the root is
//       absent from the registered set and carries its OWN error-severity
//       `theta/load/callee-has-errors` row (`code-registry-load.md`, line 42,
//       whose Trigger already names this subject on this surface at this
//       severity — bug 0280 §Expected behaviour mints no new registry row, so
//       none is asserted here).
//
//       The mode row's REACH is asserted as well as the refusal (bug 0280 §Fix
//       constraint 2, the anti-double-report lock): one prompt-mode entry is one
//       condition, so `theta/load/prompt-mode-callable` belongs at the declaring
//       file alone and the caller above it takes `theta/load/callee-has-errors`
//       INSTEAD — never a second mode row.
//
//   (2) THE BYTE-NEIGHBOUR HEALTHY CONTROL. The same four files with the
//       grandchild's `mode:` line reading `subagent`. All three levels of the
//       chain must register AND the root must DRIVE a real turn. This is what
//       keeps the widened deep verdict from refusing every caller: without it
//       (1)'s absence claim would also hold for a fix that dropped the `tools:`
//       surface entirely, and the drive is what shows a registered chain over a
//       real subagent-mode child still runs.
//
// HOW THIS CELL REDS (the neutralisation the fix's own seam admits). The fix has
// two components inside `calleeFailsOwnStructuralChecksBody`
// (`src/extension/production-composition.ts` — cited by SYMBOL, never by line:
// that file moved by roughly +215 lines in the immediately preceding change).
// Either one alone restores the filed symptom in boot (1): reverting the
// `stubDeps.resolveThetaCallee` `mode` to the constant `"subagent"` (dropping
// the `declaredMode` lookup), or dropping the `theta/load/prompt-mode-callable`
// disjunct from the frame's verdict filter. Under either edit the root is back
// in the registered set and no `theta/load/callee-has-errors` row is located at
// its file. Boot (2) is unaffected by either edit, which is what makes the pair
// a discriminator rather than a one-sided absence claim.
//
// OBSERVABLES (AGENTS.md §"Assert on real observables, not on `prompt()`
// resolving"; no assertion here is `prompt()` merely resolving):
//   1. REGISTRATION — `handle.registeredNames()` / `handle.command(stem)` read
//      off the real `ExtensionRunner` after the real `pi.registerCommand` step.
//   2. The `theta-system-note` CHANNEL, read off the settled in-memory
//      `SessionManager` (never off racy events): the shipped sink renders every
//      error-severity load diagnostic through `renderDiagnosticLine`
//      (`src/diagnostics/diagnostic.ts`), which puts the located file, the
//      registry CODE and the registry Message on the line. Registration alone
//      cannot report WHICH file a row is located at, and this bug is precisely a
//      row's absence from one particular file; this channel can.
//   3. The drive's `userTexts` (deterministic outbound render, carrying a number
//      the theta itself computed) and its `systemNotes` (every fail-closed
//      ending of a top-level drive lands there). The model's arithmetic reply is
//      the stochastic channel and is not asserted at all.
//
// DIAG-4. Expected messages are read out of the shipped registry page through
// `registryMessage`, never transcribed as prose, so registry drift reds here
// instead of comparing against a stale sentence.
//
// PATH SEPARATORS. Two walks spell the same file differently. Every path
// comparison below separator-normalises first. The spelling divergence itself is
// bug 0268's subject and is neither touched nor asserted on.
//
// NO SILENT SKIPPING: `requireLiveProvider` fails loudly on a missing
// provider/model, each boot's registration precondition is asserted before any
// absence claim is read, the premise row (the mode row at the namer) is asserted
// before the claims that rest on it, and a boot that put NOTHING on the note
// channel `failLoudly`s by name rather than letting an absence assertion pass
// vacuously.
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins").
// The control root is prompt mode and exposes its subagent child to the model
// (`docs/spec_topics/frontmatter/frontmatter-fields-a.md`, line 74: `tools`
// declares the callable set exposed to both code and model), so a model turn MAY
// reach the RFC-0006 subagent child launch. `tests/live/harness.ts` sets all
// three ambient inputs at module scope — `process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN` and the `PI_THETA_SUBAGENT_PARENT_PID`
// carriage — and importing the harness inherits them; this file adds no pin of
// its own and must not, or the two setters could drift apart.
//
// Token-bounded: one live turn, a task-framed arithmetic question over a number
// the theta computed (bug 0243 retired the verbatim-echo drive sentinel; the
// discriminator here is the rendered outbound template, not the model's reply).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../../tools/code-registry/index.js";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
  type LiveExtensionHandle,
  type LiveWorkspace,
  type PlantedTheta,
} from "./harness";

const CALLEE_HAS_ERRORS_CODE = "theta/load/callee-has-errors";
const PROMPT_MODE_CODE = "theta/load/prompt-mode-callable";

/** Level 0: the prompt-mode root whose `tools:` names the child. */
const ROOT_STEM = "b0280scratchroot";
/** Level 1: the subagent-mode child whose OWN `tools:` names the grandchild. */
const CHILD_STEM = "b0280scratchchild";
/** Level 2: the leaf whose declared `mode:` is the whole difference between the boots. */
const GRANDCHILD_STEM = "b0280scratchgrand";
/** An unrelated, `tools:`-free theta planted in both workspaces as the vacuity guard. */
const CLEAN_STEM = "b0280scratchclean";

/**
 * The two summands the root adds in code. Their sum is rendered into the
 * outbound template, so the deterministic drive channel carries a value only the
 * theta's own evaluation could have produced — the compute-from-inline-value
 * discriminator, not a verbatim-echo demand (bug 0243).
 */
const LEFT_SUMMAND = 263;
const RIGHT_SUMMAND = 514;
const COMPUTED_SUM = String(LEFT_SUMMAND + RIGHT_SUMMAND);

/** The task-framed arithmetic question, over the number the theta computed. */
const DRIVE_QUESTION_PREFIX = `The prior step produced the number ${COMPUTED_SUM}.`;

/**
 * The root, identical in both workspaces: `mode: prompt`, one `tools:` `.theta`
 * entry naming the subagent-mode child, and one `@`…`` query over a computed
 * value so the healthy half has a real turn to drive.
 */
const ROOT_SOURCE = [
  "---",
  "mode: prompt",
  "tools:",
  `  - ./${CHILD_STEM}.theta as child`,
  "---",
  `let n = ${LEFT_SUMMAND} + ${RIGHT_SUMMAND}`,
  "let r = @`The prior step produced the number ${n}. " +
    "What is that number plus 100? Answer with the number only.`?",
  "r",
  "",
].join("\n");

/**
 * The child, identical in both workspaces: `mode: subagent`, a clean body, its
 * OWN `tools:` naming the grandchild by the same literal in both. It is the file
 * that DECLARES the offending entry in boot (1), so it is the file that must
 * carry the single `theta/load/prompt-mode-callable` row — and the file whose
 * refusal the root above it must inherit as `theta/load/callee-has-errors`.
 */
const CHILD_SOURCE = [
  "---",
  "mode: subagent",
  "description: b0280scratch fixture child",
  "tools:",
  `  - ./${GRANDCHILD_STEM}.theta as grand`,
  "---",
  "let a = 1",
  "",
].join("\n");

/**
 * The grandchild, parameterised by its declared mode. A prompt-mode grandchild
 * is itself a well-formed theta and registers on its own account — what it may
 * not do is sit in another file's `tools:` — so the mode line is the only
 * structural variable in the pair. The body follows the mode because a
 * prompt-mode file needs a query body and a subagent-mode file does not.
 */
function grandchildSource(mode: "prompt" | "subagent"): string {
  return [
    "---",
    `mode: ${mode}`,
    "description: b0280scratch fixture grandchild",
    "---",
    mode === "prompt" ? "@`hi`" : "let a = 1",
    "",
  ].join("\n");
}

/**
 * An unrelated, `tools:`-free theta present in BOTH workspaces. It is the
 * per-boot vacuity guard: a boot in which it fails to register has a discovery
 * or registration regression, and no absence claim below means anything. It is
 * never driven, so it spends no tokens.
 */
const CLEAN_SOURCE = ["---", "mode: prompt", "---", "@`ping`", ""].join("\n");

/** The three files that are byte-identical across both workspaces. */
const SHARED_THETAS: readonly PlantedTheta[] = [
  { source: "project", stem: ROOT_STEM, text: ROOT_SOURCE },
  { source: "project", stem: CHILD_STEM, text: CHILD_SOURCE },
  { source: "project", stem: CLEAN_STEM, text: CLEAN_SOURCE },
];

/** Plant the three shared fixture files plus the grandchild in the given mode. */
function plantWorkspace(grandchildMode: "prompt" | "subagent"): LiveWorkspace {
  return plantThetaWorkspace([
    ...SHARED_THETAS,
    { source: "project", stem: GRANDCHILD_STEM, text: grandchildSource(grandchildMode) },
  ]);
}

// ── Registry oracle (DIAG-4) ────────────────────────────────────────────────

interface RegistryRow {
  code: string;
  message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-load.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

/**
 * The row's normative *Message* (DIAG-4) as a regex with the `<placeholder>`
 * slots opened up. Fails loudly naming the registry page when the row is absent,
 * so registry drift can never degrade a presence assertion into a comparison
 * against `undefined`.
 */
function normativeMessagePattern(code: string): RegExp {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    failLoudly(
      "bug-0280 live cell precondition unmet: " +
        "docs/spec_topics/diagnostics/code-registry-load.md carries no Message row for " +
        `${code} — the DIAG-4 column is this cell's only message oracle, so a missing row ` +
        "is a harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}

// ── The note channel ────────────────────────────────────────────────────────

/**
 * The `theta-system-note` channel contents of the settled in-memory
 * `SessionManager` — every note the boot appended, including the shipped sink's
 * per-error load-diagnostic notes. Mirrors the harness's own private
 * `collectSystemNotes` reader (string or text-part-array content).
 */
function bootNotes(handle: LiveExtensionHandle): readonly string[] {
  const notes: string[] = [];
  for (const entry of handle.sessionManager.getEntries()) {
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

/** Separator-normalise a path so Win32 `\` and POSIX `/` spellings compare (bug 0268). */
function normalisePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/** One rendered diagnostic line, split at the code marker `renderDiagnosticLine` writes. */
interface RenderedRow {
  /** The leading location segment: the located file, separator-normalised. */
  readonly location: string;
  /** The registry *Message* the line carries. */
  readonly message: string;
}

/**
 * Every rendered line in the boot's notes carrying `code`. `renderDiagnosticLine`
 * (`src/diagnostics/diagnostic.ts`) writes `<file>:<line>:<col>: <code>:
 * <message>` for a located row, so splitting at the code marker separates WHERE
 * the row sits from WHAT it says. Hint and related lines are separate lines and
 * are passed over.
 */
function renderedRows(handle: LiveExtensionHandle, code: string): readonly RenderedRow[] {
  const marker = `: ${code}: `;
  const rows: RenderedRow[] = [];
  for (const note of bootNotes(handle)) {
    for (const line of note.split("\n")) {
      const at = line.indexOf(marker);
      if (at < 0) continue;
      rows.push({
        location: normalisePath(line.slice(0, at)),
        message: line.slice(at + marker.length),
      });
    }
  }
  return rows;
}

/** Rows whose located file is the planted `<stem>.theta`. */
function rowsLocatedAt(
  handle: LiveExtensionHandle,
  code: string,
  stem: string,
): readonly RenderedRow[] {
  return renderedRows(handle, code).filter((row) => row.location.includes(`/${stem}.theta`));
}

/** Render a row list for an assertion message. */
function describeRows(rows: readonly RenderedRow[]): readonly string[] {
  return rows.map((row) => `${row.location}: ${row.message}`);
}

/** The boot put SOMETHING on the note channel, so an absence claim is not read off a dead channel. */
function requireNoteChannel(handle: LiveExtensionHandle, half: string): void {
  if (bootNotes(handle).length === 0) {
    failLoudly(
      `bug-0280 live cell precondition unmet: the ${half} boot appended NO ` +
        "`theta-system-note` entries, so the shipped load-diagnostic channel is unobservable " +
        "here. Registered: " + JSON.stringify(handle.registeredNames()),
    );
  }
}

describe("bug 0280 live cell — a `tools:` root does not register over a child whose own `tools:` names a prompt-mode grandchild, at live production load", () => {
  it("the root above a prompt-mode grandchild entry is absent from the registered set and carries theta/load/callee-has-errors at its own file while the mode row stays at the declaring child alone, and the byte-neighbour subagent-mode chain all registers and the root drives", async () => {
    const provider = await requireLiveProvider();

    // ── (1) THE REFUSAL: the grandchild is declared `mode: prompt` ─────────
    const offenderWorkspace = plantWorkspace("prompt");
    const offender = await bootShippedExtension({ workspace: offenderWorkspace, provider });
    try {
      const offenderRegistered = JSON.stringify(offender.registeredNames());

      // Vacuity guard: an unrelated, `tools:`-free theta in the same boot.
      expect(
        offender.command(CLEAN_STEM),
        "bug-0280 live cell precondition unmet: the unrelated clean theta did not register in " +
          "the refusal boot, so discovery or registration regressed independently of bug 0280 " +
          "and every absence claim below would hold vacuously. Registered: " + offenderRegistered,
      ).toBeDefined();

      requireNoteChannel(offender, "refusal");

      // Premise: the mode route fired at all this pass, at the file whose own
      // `tools:` entry names the prompt-mode callee. Bug 0280's whole claim is
      // about the level ABOVE that row, so its absence means the fixture stopped
      // exercising the route and the boot is measuring an unrelated condition.
      const childModeRows = rowsLocatedAt(offender, PROMPT_MODE_CODE, CHILD_STEM);
      expect(
        describeRows(childModeRows),
        `bug-0280 live cell precondition unmet: no ${PROMPT_MODE_CODE} row is located at the ` +
          "CHILD's own file, so the structural check at the bottom of the chain — the premise " +
          "of everything above it — did not fire. Notes: " + JSON.stringify(bootNotes(offender)),
      ).not.toEqual([]);
      expect(
        (childModeRows[0] as RenderedRow).message,
        `the ${PROMPT_MODE_CODE} line must carry the registry's normative Message (DIAG-4, ` +
          "read from docs/spec_topics/diagnostics/code-registry-load.md, line 30, not " +
          "transcribed here)",
      ).toMatch(normativeMessagePattern(PROMPT_MODE_CODE));

      // The declaring file's own landed disposition, unchanged by this fix: an
      // error-severity load diagnostic does not register the file carrying it.
      expect(
        offender.registeredNames(),
        "the child declares the offending entry and must not register. Registered: " +
          offenderRegistered,
      ).not.toContain(CHILD_STEM);

      // The prompt-mode grandchild is a well-formed theta on its own account —
      // what it may not be is another file's `tools:` entry. Its registration is
      // the separability guard for the two absence claims above and below it: a
      // fix that refused every file in the chain would red here.
      expect(
        offender.command(GRANDCHILD_STEM),
        "a prompt-mode theta registers as its own slash command; only its use as a `tools:` " +
          "entry is refused. Registered: " + offenderRegistered,
      ).toBeDefined();

      // THE FIXED OBSERVABLE. `docs/spec_topics/invocation.md` §Static
      // resolution, line 22: on the `tools:` surface "the callable cannot be
      // created, and the parent theta does not register". Pre-fix the root
      // registered here and became an author-runnable slash command offering the
      // model a callable over a file that minted no callable of its own — with a
      // frozen entry byte-identical to the healthy control's, so no caller-side
      // observable separated the two.
      expect(
        offender.registeredNames(),
        "bug-0280 PRIMARY: the root must not register over a child this same pass " +
          "un-registers. Pre-fix the recursion resolved every `.theta` spec below depth 1 " +
          "through a stub whose `mode` was the constant `subagent`, so the child was judged as " +
          "passing its own structural checks, the V15f `callee-has-errors` loop had no subject " +
          "at the root, and this name was present. Registered: " + offenderRegistered,
      ).not.toContain(ROOT_STEM);
      expect(
        offender.command(ROOT_STEM),
        "the same claim on the runner's own lookup: no slash command an author could run. " +
          "Registered: " + offenderRegistered,
      ).toBeUndefined();

      // The author-facing half of bug 0280 §Expected behaviour: a row LOCATED AT
      // THE ROOT's `tools:` site, not only at the child. This is the assertion
      // the widened verdict carries; dropping the `prompt-mode-callable`
      // disjunct from the frame's verdict filter, or reverting the stub's `mode`
      // to the constant, reds it.
      const rootRows = rowsLocatedAt(offender, CALLEE_HAS_ERRORS_CODE, ROOT_STEM);
      expect(
        describeRows(rootRows),
        `bug-0280: an error-severity ${CALLEE_HAS_ERRORS_CODE} row must be located at the ` +
          "ROOT's own file — pre-fix the author's whole load report named the child, and " +
          "nothing said the root's `tools:` entry was dead. Notes: " +
          JSON.stringify(bootNotes(offender)),
      ).not.toEqual([]);
      expect(
        (rootRows[0] as RenderedRow).message,
        `the ${CALLEE_HAS_ERRORS_CODE} line must carry the registry's normative Message ` +
          "(DIAG-4, read from docs/spec_topics/diagnostics/code-registry-load.md, line 42, not " +
          "transcribed here)",
      ).toMatch(normativeMessagePattern(CALLEE_HAS_ERRORS_CODE));

      // THE ANTI-DOUBLE-REPORT LOCK (bug 0280 §Fix constraint 2): one
      // prompt-mode entry is one condition, so the mode row belongs at the
      // declaring file alone and the caller above takes
      // `theta/load/callee-has-errors` INSTEAD — never a second mode row.
      expect(
        describeRows(rowsLocatedAt(offender, PROMPT_MODE_CODE, ROOT_STEM)),
        `the mode row belongs to the file that DECLARES the entry, so no ${PROMPT_MODE_CODE} ` +
          "row belongs at the root's file. Notes: " + JSON.stringify(bootNotes(offender)),
      ).toEqual([]);
      expect(
        describeRows(rowsLocatedAt(offender, CALLEE_HAS_ERRORS_CODE, CHILD_STEM)),
        `the child declares the entry and carries the ${PROMPT_MODE_CODE} row for it, so ` +
          `${CALLEE_HAS_ERRORS_CODE} must not co-fire there. Notes: ` +
          JSON.stringify(bootNotes(offender)),
      ).toEqual([]);
    } finally {
      await offender.dispose();
      offenderWorkspace.dispose();
    }

    // ── (2) THE BYTE-NEIGHBOUR CONTROL: the same chain, subagent grandchild ─
    const controlWorkspace = plantWorkspace("subagent");
    const control = await bootShippedExtension({ workspace: controlWorkspace, provider });
    try {
      const controlRegistered = JSON.stringify(control.registeredNames());

      // All three levels register. This is what the widened deep verdict must
      // not cost: the only difference from the refusal workspace is the
      // grandchild's declared mode, beside byte-identical fixture files.
      expect(
        control.command(GRANDCHILD_STEM),
        "the subagent-mode grandchild must register on its own merits. Registered: " +
          controlRegistered,
      ).toBeDefined();
      expect(
        control.command(CHILD_STEM),
        "the child must register — its own `tools:` entry names a subagent-mode grandchild. " +
          "Registered: " + controlRegistered,
      ).toBeDefined();
      expect(
        control.command(ROOT_STEM),
        "bug-0280 separability control: the root of a fully subagent-mode chain must keep " +
          "registering, so the refusal boot's absence is the deep verdict's doing and not a " +
          "`tools:` surface that refuses everything. Registered: " + controlRegistered,
      ).toBeDefined();

      // No row anywhere in the healthy boot.
      expect(
        describeRows(renderedRows(control, CALLEE_HAS_ERRORS_CODE)),
        `a chain whose every callee is subagent-mode must draw no ${CALLEE_HAS_ERRORS_CODE} ` +
          "row anywhere. Notes: " + JSON.stringify(bootNotes(control)),
      ).toEqual([]);
      expect(
        describeRows(renderedRows(control, PROMPT_MODE_CODE)),
        "no `tools:` entry here points at a prompt-mode file, so no " +
          `${PROMPT_MODE_CODE} row belongs anywhere in this boot. Notes: ` +
          JSON.stringify(bootNotes(control)),
      ).toEqual([]);

      // The registered root RUNS. `userTexts` is the deterministic outbound
      // render — the exact text the theta code computed and sent — and it
      // carries a number only the theta's own evaluation could produce, so it
      // discriminates a real turn over a real computed value. The absence of a
      // fail-closed note is what proves the drive ended cleanly rather than
      // merely resolving. The model's reply is stochastic and is not asserted.
      const driven = await driveSlashCaptureTurn(control, `/${ROOT_STEM}`);
      expect(
        driven.userTexts.join("\n"),
        "the root's QRY-18 rendered template must carry the sum the theta computed; its " +
          "absence means either the query never reached the provider or the computed value " +
          "never reached the prompt. Observed: " + JSON.stringify(driven.userTexts),
      ).toContain(DRIVE_QUESTION_PREFIX);
      expect(
        driven.systemNotes,
        "every fail-closed ending of a top-level drive lands on the theta-system-note channel " +
          "(the SLSH-3 err note, the cancelled note, the panic framings); the healthy root " +
          "must end with none. Observed: " + JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await control.dispose();
      controlWorkspace.dispose();
    }
  });
});
