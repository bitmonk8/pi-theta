// Bug 0275 — a `tools:` GRANDPARENT must not register over a child whose own
// `tools:` names a GRANDCHILD whose own `tools:` entry escapes every active
// discovery root, and which the same load pass therefore un-registers.
//
// Standalone live registration cell (the standalone-live-file precedent of
// `tests/live/unterminated-template-registration-live-cell.test.ts`,
// `tests/live/b0248live-nested-malformed-escape-live-cell.test.ts`,
// `tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts` and
// `tests/live/b0271live-grandchild-callee-drop-depth-two-live-cell.test.ts`;
// this lane's parent renumbers the H8a sequence of
// `tests/live/live-production-acceptance.test.ts` at merge, so this file carries
// no numeric id from that file's own cell sequence and moves no cell in it).
//
// TIER: H8a (live). The fixed surface is a REGISTRATION OUTCOME three `tools:`
// levels deep, and that outcome is only fully observable after real discovery →
// real load → the real `pi.registerCommand` step of the shipped composition
// root over real on-disk discovery roots. The offline witness
// (`tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts`, five green
// cells) reads `wiring.thetas` off `composeExtensionInstance` driven over host
// doubles, so its `pi` is a double whose `registerCommand` records nothing: it
// cannot show that the grandparent never becomes an author-runnable slash
// command on a real `ExtensionRunner`, and it drives no model turn, so it cannot
// show that the widened deep verdict leaves a healthy three-level chain able to
// run. Those two claims are what this cell adds, and neither the unit nor an
// integration tier reaches them — an integration tier would still stub the
// runner and the provider, which are exactly the two things under observation.
//
// WHAT THE CELL OBSERVES. Two boots over two workspaces that plant the SAME six
// files; their `.theta` bytes differ only in the GRANDCHILD's `tools:` list —
// one entry spec, in-root in the control and out-of-root in the offender:
//
//   (a) THE OFFENDER. `b0275livegp.theta` is `mode: prompt` and its `tools:`
//       names `b0275livechild.theta`, a `mode: subagent` child whose own
//       `tools:` names `./b0275livegc.theta`, whose own `tools:` names
//       `../../outside/b0275liveout.theta` — a file that exists and is readable
//       and is planted OUTSIDE every active discovery root.
//       `docs/spec_topics/diagnostics/code-registry-load.md`, line 36, makes
//       that `theta/load/invoke-path-escape` at error severity, and
//       `docs/spec_topics/invocation.md` §Static resolution, line 20, bounds the
//       escaping TARGET's judgment ("its contents are never parsed") while
//       settling the file that NAMES it: "that file and its immediate caller
//       each carry the single relocated `theta/load/invoke-path-escape` row for
//       the entry, and the own-structural-check failure composes into
//       `theta/load/callee-has-errors` at every caller above that immediate
//       caller, however far below such a caller the escaping entry sits."
//       Line 22 then fixes the consequence at each `tools:` edge above it: "the
//       callable cannot be created, and the parent theta does not register".
//       PRE-FIX the grandparent registered anyway, carrying no row of its own:
//       the escape verdict reached the entry owner and its immediate caller and
//       stopped, because bug 0271's recursive predicate took a bare `continue`
//       on an escaping entry and the one-level relocation
//       (`checkNestedToolsContainment`, drained through
//       `resolveThetaToolsAtLoad`'s escape loop) cannot reach past the immediate
//       caller. POST-FIX the deep verdict composes and all three files are
//       absent from the registered set, with the grandparent carrying its OWN
//       error-severity `theta/load/callee-has-errors` row
//       (`code-registry-load.md`, line 42, whose Trigger already names this
//       subject on this surface at this severity — bug 0275 §Fix constraint 4
//       prefers that row over a newly minted code, so no new registry row is
//       asserted here).
//
//       The escape row's REACH is asserted as well as the refusal: it belongs to
//       the grandchild and the child and to no file above them (bug 0275 §Fix
//       constraint 2, the anti-double-report lock — one condition, one
//       caller-located row, which is why the immediate caller carries the escape
//       row and NOT `theta/load/callee-has-errors` beside it).
//
//   (b) THE BYTE-NEIGHBOUR HEALTHY CONTROL. The same six files, with the
//       grandchild's single `tools:` entry pointing at the in-root leaf instead
//       of the out-of-root target. All three levels of the chain must register
//       AND the grandparent must DRIVE a real turn. This is what keeps the
//       widened deep verdict from refusing every caller: without it (a)'s
//       absence claim would also hold for a fix that dropped the `tools:`
//       surface entirely.
//
// HOW THIS CELL REDS (the neutralisation the fix's own seam admits). The shipped
// deep verdict is the fold `recursive.fails || recursive.ownEscapes` inside
// `calleeFailsOwnStructuralChecksBody` (`src/extension/production-composition.ts`
// — cited by SYMBOL, never by line: that file moved by roughly +215 lines in
// this change). Reverting that one expression to `recursive.fails` restores the
// filed symptom, and boot (a) reds twice over: the grandparent is back in the
// registered set and no `theta/load/callee-has-errors` row is located at its
// file. Boot (b) is unaffected by that edit, which is what makes the pair a
// discriminator rather than a one-sided absence claim.
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
// provider/model, the out-of-root escape target's plant is asserted on disk
// before the offender boot, each boot's registration precondition is asserted
// before any absence claim is read, and a boot that put NOTHING on the note
// channel `failLoudly`s by name rather than letting an absence assertion pass
// vacuously.
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins").
// The control grandparent is prompt mode and exposes its subagent child to the
// model (`docs/spec_topics/frontmatter/frontmatter-fields-a.md`, line 74:
// `tools` declares the callable set exposed to both code and model), so a model
// turn MAY reach the RFC-0006 subagent child launch. `tests/live/harness.ts`
// sets all three ambient inputs at module scope — `process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN` and the `PI_THETA_SUBAGENT_PARENT_PID`
// carriage — and importing the harness inherits them; this file adds no pin of
// its own and must not, or the two setters could drift apart.
//
// Token-bounded: one live turn, a task-framed arithmetic question over a number
// the theta computed (bug 0243 retired the verbatim-echo drive sentinel; the
// discriminator here is the rendered outbound template, not the model's reply).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
const INVOKE_PATH_ESCAPE_CODE = "theta/load/invoke-path-escape";

/** Level 0: the prompt-mode grandparent whose `tools:` names the child. */
const GRANDPARENT_STEM = "b0275livegp";
/** Level 1: the subagent-mode child whose OWN `tools:` names the grandchild. */
const CHILD_STEM = "b0275livechild";
/** Level 2: the grandchild whose single `tools:` entry differs between the workspaces. */
const GRANDCHILD_STEM = "b0275livegc";
/** The in-root leaf the CONTROL grandchild names — planted in both workspaces. */
const LEAF_STEM = "b0275liveleaf";
/** The escape target: planted in both workspaces, outside every discovery root. */
const OUT_STEM = "b0275liveout";
const CLEAN_STEM = "b0275liveclean";

/**
 * The sibling directory the escape target is planted in. It is NOT a discovery
 * root, which is how the offender reaches the containment route with a target
 * that genuinely exists and is genuinely readable — the one disposition
 * `docs/spec_topics/invocation.md`, line 20, reserves for containment.
 */
const OUTSIDE_DIR = "outside";

/**
 * The offender grandchild's entry spec: relative, from `<cwd>/.pi/theta/` up to
 * `<cwd>/outside/`. The control's spec below names the in-root leaf instead, and
 * that one string is the whole difference between the two workspaces.
 */
const ESCAPING_SPEC = `../../${OUTSIDE_DIR}/${OUT_STEM}.theta`;
const IN_ROOT_SPEC = `./${LEAF_STEM}.theta`;

/**
 * The two summands the grandparent adds in code. Their sum is rendered into the
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
 * The grandparent, identical in both workspaces: `mode: prompt`, one `tools:`
 * `.theta` entry naming the subagent-mode child, and one `@`…`` query over a
 * computed value so the healthy half has a real turn to drive.
 */
const GRANDPARENT_SOURCE = [
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
 * OWN `tools:` naming the grandchild by the same literal in both. It is the
 * IMMEDIATE caller of the escaping entry's owner in the offender workspace, so
 * it is the file the one-level relocation covers — and therefore the file that
 * must carry the escape row and no `theta/load/callee-has-errors` beside it.
 */
const CHILD_SOURCE = [
  "---",
  "mode: subagent",
  "description: b0275live fixture child",
  "tools:",
  `  - ./${GRANDCHILD_STEM}.theta as gc`,
  "---",
  "let a = 1",
  "",
].join("\n");

/**
 * The grandchild, parameterised by its single `tools:` entry spec. Everything
 * else about the file — frontmatter shape, description, body — is byte-identical
 * across the two workspaces, so the entry spec is the only structural variable
 * in the pair.
 */
function grandchildSource(spec: string): string {
  return [
    "---",
    "mode: subagent",
    "description: b0275live fixture grandchild",
    "tools:",
    `  - ${spec} as far`,
    "---",
    "let a = 1",
    "",
  ].join("\n");
}

/** A clean subagent-mode leaf with no `tools:` of its own. */
function leafSource(label: string): string {
  return [
    "---",
    "mode: subagent",
    `description: b0275live fixture ${label}`,
    "---",
    "let a = 1",
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

/** The four files that are byte-identical across both workspaces. */
const SHARED_THETAS: readonly PlantedTheta[] = [
  { source: "project", stem: GRANDPARENT_STEM, text: GRANDPARENT_SOURCE },
  { source: "project", stem: CHILD_STEM, text: CHILD_SOURCE },
  { source: "project", stem: LEAF_STEM, text: leafSource("leaf") },
  { source: "project", stem: CLEAN_STEM, text: CLEAN_SOURCE },
];

/** The absolute path of the planted escape target, for the plant precondition. */
function escapeTargetPath(workspace: LiveWorkspace): string {
  return join(workspace.cwd, OUTSIDE_DIR, `${OUT_STEM}.theta`);
}

/**
 * Plant the four shared fixture files plus the grandchild — escaping or in-root
 * — and, in BOTH workspaces, the escape target under `<cwd>/outside/`. Planting
 * the target in the control too keeps the two file SETS identical, so nothing
 * separates the boots except the grandchild's one entry spec. The workspace's
 * own `dispose` removes `<cwd>` recursively, so `outside/` needs no separate
 * teardown.
 */
function plantWorkspace(grandchildEscapes: boolean): LiveWorkspace {
  const workspace = plantThetaWorkspace([
    ...SHARED_THETAS,
    {
      source: "project",
      stem: GRANDCHILD_STEM,
      text: grandchildSource(grandchildEscapes ? ESCAPING_SPEC : IN_ROOT_SPEC),
    },
  ]);
  mkdirSync(join(workspace.cwd, OUTSIDE_DIR), { recursive: true });
  writeFileSync(escapeTargetPath(workspace), leafSource("escape target"), "utf8");
  return workspace;
}

/**
 * The escape target must be on disk and readable, or the offender's entry takes
 * bug 0270's unresolvable-path disposition instead of the containment one and
 * this cell measures an unrelated condition. An unplanted fixture fails loudly
 * naming the precondition, never a skip.
 */
function requireEscapeTargetPlanted(workspace: LiveWorkspace): void {
  const target = escapeTargetPath(workspace);
  if (!existsSync(target)) {
    failLoudly(
      "bug-0275 live cell precondition unmet: the out-of-root escape target was not planted " +
        `at ${target}, so the offender's grandchild entry would take the unresolvable-path ` +
        "disposition rather than the containment one and every claim below would be about a " +
        "different condition",
    );
  }
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
      "bug-0275 live cell precondition unmet: " +
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
      `bug-0275 live cell precondition unmet: the ${half} boot appended NO ` +
        "`theta-system-note` entries, so the shipped load-diagnostic channel is unobservable " +
        "here. Registered: " + JSON.stringify(handle.registeredNames()),
    );
  }
}

describe("bug 0275 live cell — a `tools:` grandparent does not register over a chain carrying an escaping `tools:` entry below its immediate callee, at live production load", () => {
  it("the grandparent of an escaping grandchild entry is absent from the registered set and carries theta/load/callee-has-errors at its own file while the escape row stays at the entry owner and its immediate caller, and the byte-neighbour in-root chain all registers and the grandparent drives", async () => {
    const provider = await requireLiveProvider();

    // ── (a) THE OFFENDER: the grandchild's one `tools:` entry escapes ──────
    const offenderWorkspace = plantWorkspace(true);
    requireEscapeTargetPlanted(offenderWorkspace);
    const offender = await bootShippedExtension({ workspace: offenderWorkspace, provider });
    try {
      const offenderRegistered = JSON.stringify(offender.registeredNames());

      // Vacuity guard: an unrelated, `tools:`-free theta in the same boot.
      expect(
        offender.command(CLEAN_STEM),
        "bug-0275 live cell precondition unmet: the unrelated clean theta did not register in " +
          "the offender boot, so discovery or registration regressed independently of bug 0275 " +
          "and every absence claim below would hold vacuously. Registered: " + offenderRegistered,
      ).toBeDefined();

      requireNoteChannel(offender, "offender");

      // Precondition: the containment route fired at all this pass, at the file
      // whose own `tools:` entry escapes. Bug 0275's whole claim is about the
      // levels ABOVE that row, so its absence means the fixture stopped escaping
      // and the boot is measuring an unrelated condition.
      const grandchildRows = rowsLocatedAt(offender, INVOKE_PATH_ESCAPE_CODE, GRANDCHILD_STEM);
      expect(
        describeRows(grandchildRows),
        `bug-0275 live cell precondition unmet: no ${INVOKE_PATH_ESCAPE_CODE} row is located ` +
          "at the grandchild's own file, so the escape route at the bottom of the chain — the " +
          "premise of everything above it — did not fire. Notes: " +
          JSON.stringify(bootNotes(offender)),
      ).not.toEqual([]);
      expect(
        (grandchildRows[0] as RenderedRow).message,
        `the ${INVOKE_PATH_ESCAPE_CODE} line must carry the registry's normative Message ` +
          "(DIAG-4, read from docs/spec_topics/diagnostics/code-registry-load.md, line 36, not " +
          "transcribed here)",
      ).toMatch(normativeMessagePattern(INVOKE_PATH_ESCAPE_CODE));

      // Precondition 2: the landed DEPTH-1 relocation — the escaping entry's
      // IMMEDIATE caller carries the relocated escape row and does not register.
      // This report changes no depth-1 outcome (bug 0275 §Non-goals), and
      // without this row the boot is measuring some other condition.
      expect(
        describeRows(rowsLocatedAt(offender, INVOKE_PATH_ESCAPE_CODE, CHILD_STEM)),
        `bug-0275 live cell precondition unmet: no ${INVOKE_PATH_ESCAPE_CODE} row is located ` +
          "at the CHILD's own file, so the one-level relocation — the mechanism whose reach " +
          "this report extends — did not fire. Notes: " + JSON.stringify(bootNotes(offender)),
      ).not.toEqual([]);
      expect(
        offender.registeredNames(),
        "an error-severity load diagnostic does not register the file that carries it; the " +
          "grandchild's own disposition is correct pre-fix and must stay. Registered: " +
          offenderRegistered,
      ).not.toContain(GRANDCHILD_STEM);
      expect(
        offender.registeredNames(),
        "the immediate caller's landed depth-1 refusal must stay. Registered: " +
          offenderRegistered,
      ).not.toContain(CHILD_STEM);

      // THE FIXED OBSERVABLE. `docs/spec_topics/invocation.md` §Static
      // resolution, line 22: on the `tools:` surface "the callable cannot be
      // created, and the parent theta does not register". Pre-fix the
      // grandparent registered here and became an author-runnable slash command
      // offering the model a callable over a file that minted no callable of its
      // own — with a frozen entry byte-identical to the healthy control's, so no
      // caller-side observable separated the two.
      expect(
        offender.registeredNames(),
        "bug-0275 PRIMARY: the grandparent must not register over a chain this same pass " +
          "un-registers two levels down. Pre-fix `calleeFailsOwnStructuralChecksBody` took a " +
          "bare `continue` on an escaping entry, so the grandchild was judged as passing its " +
          "own structural checks, the V15f `callee-has-errors` loop had no subject at the " +
          "grandparent, and this name was present. Registered: " + offenderRegistered,
      ).not.toContain(GRANDPARENT_STEM);
      expect(
        offender.command(GRANDPARENT_STEM),
        "the same claim on the runner's own lookup: no slash command an author could run. " +
          "Registered: " + offenderRegistered,
      ).toBeUndefined();

      // The author-facing half of bug 0275 §Fix constraint 1: a row LOCATED AT
      // THE GRANDPARENT's `tools:` site, not only at the child and the
      // grandchild. This is the assertion the `recursive.fails ||
      // recursive.ownEscapes` fold in `calleeFailsOwnStructuralChecksBody`
      // carries; reverting that fold to `recursive.fails` reds it.
      const grandparentRows = rowsLocatedAt(offender, CALLEE_HAS_ERRORS_CODE, GRANDPARENT_STEM);
      expect(
        describeRows(grandparentRows),
        `bug-0275: an error-severity ${CALLEE_HAS_ERRORS_CODE} row must be located at the ` +
          "GRANDPARENT's own file — pre-fix the author's whole load report named the child and " +
          "the grandchild, and nothing said the grandparent's `tools:` entry was dead. Notes: " +
          JSON.stringify(bootNotes(offender)),
      ).not.toEqual([]);
      expect(
        (grandparentRows[0] as RenderedRow).message,
        `the ${CALLEE_HAS_ERRORS_CODE} line must carry the registry's normative Message ` +
          "(DIAG-4, read from docs/spec_topics/diagnostics/code-registry-load.md, line 42, not " +
          "transcribed here)",
      ).toMatch(normativeMessagePattern(CALLEE_HAS_ERRORS_CODE));

      // THE ESCAPE ROW'S REACH. `code-registry-load.md`, line 36, gives that row
      // to the entry, and `invocation.md`, line 20, gives it to the entry's file
      // and its IMMEDIATE caller only. The grandparent is above that caller, so
      // it takes `theta/load/callee-has-errors` INSTEAD — never the escape row
      // as well.
      expect(
        describeRows(rowsLocatedAt(offender, INVOKE_PATH_ESCAPE_CODE, GRANDPARENT_STEM)),
        `the relocation spans exactly one level, so no ${INVOKE_PATH_ESCAPE_CODE} row belongs ` +
          "at the grandparent's file. Notes: " + JSON.stringify(bootNotes(offender)),
      ).toEqual([]);

      // THE ANTI-DOUBLE-REPORT LOCK (bug 0275 §Fix constraint 2): one escaping
      // entry is one condition, so the immediate caller carries exactly the
      // relocated escape row and no `theta/load/callee-has-errors` beside it. A
      // fix that folded containment into the recursion without gating the level
      // the relocation already covers reds here.
      expect(
        describeRows(rowsLocatedAt(offender, CALLEE_HAS_ERRORS_CODE, CHILD_STEM)),
        "one escaping entry draws exactly one row at its immediate caller — the relocated " +
          `${INVOKE_PATH_ESCAPE_CODE} — so ${CALLEE_HAS_ERRORS_CODE} must not co-fire there. ` +
          "Notes: " + JSON.stringify(bootNotes(offender)),
      ).toEqual([]);
    } finally {
      await offender.dispose();
      offenderWorkspace.dispose();
    }

    // ── (b) THE BYTE-NEIGHBOUR CONTROL: the same entry, in-root target ─────
    const controlWorkspace = plantWorkspace(false);
    const control = await bootShippedExtension({ workspace: controlWorkspace, provider });
    try {
      const controlRegistered = JSON.stringify(control.registeredNames());

      // All three levels register. This is what the widened deep verdict must
      // not cost: the only difference from the offender workspace is the
      // grandchild's one entry spec, beside byte-identical fixture files.
      expect(
        control.command(GRANDCHILD_STEM),
        "the in-root grandchild must register on its own merits. Registered: " +
          controlRegistered,
      ).toBeDefined();
      expect(
        control.command(CHILD_STEM),
        "the child must register — its own `tools:` entry names a grandchild whose own entry " +
          "stays inside the discovery roots. Registered: " + controlRegistered,
      ).toBeDefined();
      expect(
        control.command(GRANDPARENT_STEM),
        "bug-0275 separability control: the grandparent of a fully in-root three-level chain " +
          "must keep registering, so the offender's absence is the deep verdict's doing and " +
          "not a `tools:` surface that refuses everything. Registered: " + controlRegistered,
      ).toBeDefined();

      // No row anywhere in the healthy boot.
      expect(
        describeRows(renderedRows(control, CALLEE_HAS_ERRORS_CODE)),
        `an in-root chain must draw no ${CALLEE_HAS_ERRORS_CODE} row anywhere. Notes: ` +
          JSON.stringify(bootNotes(control)),
      ).toEqual([]);
      expect(
        describeRows(renderedRows(control, INVOKE_PATH_ESCAPE_CODE)),
        `an entry that resolves inside an active discovery root must draw no ` +
          `${INVOKE_PATH_ESCAPE_CODE} row anywhere — the escape target is planted in THIS ` +
          "workspace too and is named by nothing. Notes: " + JSON.stringify(bootNotes(control)),
      ).toEqual([]);

      // The registered grandparent RUNS. `userTexts` is the deterministic
      // outbound render — the exact text the theta code computed and sent — and
      // it carries a number only the theta's own evaluation could produce, so it
      // discriminates a real turn over a real computed value. The absence of a
      // fail-closed note is what proves the drive ended cleanly rather than
      // merely resolving. The model's reply is stochastic and is not asserted.
      const driven = await driveSlashCaptureTurn(control, `/${GRANDPARENT_STEM}`);
      expect(
        driven.userTexts.join("\n"),
        "the grandparent's QRY-18 rendered template must carry the sum the theta computed; its " +
          "absence means either the query never reached the provider or the computed value " +
          "never reached the prompt. Observed: " + JSON.stringify(driven.userTexts),
      ).toContain(DRIVE_QUESTION_PREFIX);
      expect(
        driven.systemNotes,
        "every fail-closed ending of a top-level drive lands on the theta-system-note channel " +
          "(the SLSH-3 err note, the cancelled note, the panic framings); the healthy " +
          "grandparent must end with none. Observed: " + JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await control.dispose();
      controlWorkspace.dispose();
    }
  });
});
