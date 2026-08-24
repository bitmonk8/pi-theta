// Bug 0271 — a prompt-mode GRANDPARENT's `tools:` `.theta` entry must not
// register over a subagent-mode CHILD whose own `tools:` names a GRANDCHILD that
// fails its own checks, and which the same load pass therefore un-registers.
//
// Standalone live registration cell (the standalone-live-file precedent of
// `tests/live/unterminated-template-registration-live-cell.test.ts`,
// `tests/live/b0248live-nested-malformed-escape-live-cell.test.ts`,
// `tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts`
// and `tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts`;
// this lane's parent renumbers the H8a sequence of
// `tests/live/live-production-acceptance.test.ts` at merge, so this file carries
// no numeric id from that file's own cell sequence).
//
// TIER: H8a (live). The fixed surface is a REGISTRATION OUTCOME three `tools:`
// levels deep, and that outcome is only fully observable after real discovery →
// real load → the real `pi.registerCommand` step of the shipped composition
// root. The offline witness
// (`tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts`) reads
// `wiring.thetas` off `composeExtensionInstance` driven over host doubles, so
// its `pi` is a double whose `registerCommand` records nothing: it cannot show
// that the grandparent never becomes an author-runnable slash command on a real
// `ExtensionRunner`, and it drives no model turn, so it cannot show that the
// recursive predicate leaves a healthy three-level chain able to run. Those two
// claims are what this cell adds, and neither the unit nor an integration tier
// reaches them.
//
// WHAT THE CELL OBSERVES. Two boots over two workspaces whose `.theta` bytes are
// identical except for the GRANDCHILD's body — the pair differs only in whether
// the grandchild parses:
//
//   (a) THE OFFENDER. `b0271livegp.theta` is `mode: prompt` and its `tools:`
//       names `b0271livechild.theta`, a `mode: subagent` child whose own
//       `tools:` names `./b0271livegc.theta`, whose body carries an unterminated
//       template. `docs/spec_topics/diagnostics/code-registry-parse.md`, line 80,
//       makes that `theta/parse/unterminated-template` at error severity against
//       the grandchild, so the grandchild does not register; bug 0267's landed
//       depth-1 behaviour then puts an error-severity
//       `theta/load/callee-has-errors` row at the CHILD's own file, so the child
//       does not register either. `docs/spec_topics/invocation.md` §Static
//       resolution, line 22, gives the grandparent's disposition on the `tools:`
//       surface: a callee that "fails its own structural checks is *not
//       statically resolvable*", so "the callable cannot be created, and the
//       parent theta does not register". PRE-FIX the grandparent registered
//       anyway, with a frozen callable entry byte-identical to the healthy
//       control's, because `calleeFailsOwnStructuralChecks`
//       (`src/extension/production-composition.ts`, line 2147 of that file)
//       resolved the child's own `tools:` `.theta` entries through a stub
//       `resolveThetaCallee` (same file, line 2287) that judged existence and
//       readability alone and never opened the grandchild. POST-FIX all three
//       files are absent from the registered set and the grandparent carries its
//       OWN error-severity `theta/load/callee-has-errors` row
//       (`code-registry-load.md`, line 42, whose Trigger already names this
//       subject on this surface at this severity — bug 0271 §Fix constraint 4
//       prefers that row over a newly minted code, so no new registry row is
//       asserted here).
//
//   (c) THE DISPATCH-GATE HALF, over the offender workspace's SAME boot. Bug
//       0271 §Fix constraint 5 (bug 0267's constraint 3, unchanged): whatever
//       admits the route at `parseCalleeForTools` must apply at
//       `parseCalleeTheta`'s gate (same file, line 2590) in the same change, or
//       the load-time and drive-time verdicts diverge over one file in one pass.
//       The `tools:` grandparent of (a) never registers post-fix, so it is never
//       dispatched; the surface that still reaches dispatch is the LITERAL
//       `invoke(...)` one, which `docs/spec_topics/invocation.md` §Static
//       resolution, line 22, makes WARNING severity — "the parent registers,
//       static checks against that callee are skipped".
//       `b0271liveinvcaller.theta` therefore registers in both workspaces and is
//       DRIVEN for real in the offender one. Its callee is
//       `b0271livepromptchild.theta`, PROMPT mode with the same grandchild
//       entry: the gate under test runs before `#driveCallee`'s mode branch, and
//       a prompt-mode callee cannot reach the RFC-0006 child launch in either
//       direction of the fix, so this half stays spawn-free and token-free
//       whichever way it lands. The terminal outcome asserted is an SLSH-3 err
//       note reading `theta /b0271liveinvcaller returned Err: invoke of
//       ./b0271livepromptchild.theta failed (load_failure)`, the `#driveCallee`
//       arm taken exactly when `parseCallee` returns `undefined`.
//
//   (b) THE BYTE-NEIGHBOUR HEALTHY CONTROL. The same five `.theta` files,
//       byte-for-byte, plus a grandchild whose body parses. All three levels of
//       the chain must register, no `theta/load/callee-has-errors` row may
//       appear anywhere, and the grandparent must DRIVE a real turn. This is
//       what keeps the recursive predicate from refusing every caller: without
//       it (a)'s absence claim would also hold for a fix that dropped the
//       `tools:` surface entirely.
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
//      cannot report WHICH file a row is located at, and the whole point of this
//      bug is a row's ABSENCE from one particular file; this channel can.
//   3. The drive's `userTexts` (deterministic outbound render, carrying a number
//      the theta itself computed) and its `systemNotes` (every fail-closed
//      ending of a top-level drive lands there). The model's arithmetic reply is
//      stochastic and is not asserted.
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
// absence claim is read, and a boot that put NOTHING on the note channel
// `failLoudly`s by name rather than letting an absence assertion pass vacuously.
//
// SUBAGENT CHILD PINS (AGENTS.md §"In-process harnesses…need the child pins").
// The control grandparent is prompt mode and exposes its subagent child to the
// model (`docs/spec_topics/frontmatter/frontmatter-fields-a.md`, line 74:
// `tools` declares the callable set exposed to both code and model), so a model
// turn MAY reach the RFC-0006 subagent child launch. `tests/live/harness.ts`
// sets all three ambient inputs at module scope — `process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN` and the `PI_THETA_SUBAGENT_PARENT_PID`
// carriage — and importing the harness inherits them.
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
const UNTERMINATED_TEMPLATE_CODE = "theta/parse/unterminated-template";

/** Level 0: the prompt-mode grandparent whose `tools:` names the child. */
const GRANDPARENT_STEM = "b0271livegp";
/** Level 1: the subagent-mode child whose OWN `tools:` names the grandchild. */
const CHILD_STEM = "b0271livechild";
/** Level 2: the grandchild whose body differs between the two workspaces. */
const GRANDCHILD_STEM = "b0271livegc";
/** Half (c): the literal-`invoke(...)` caller — the warning-severity surface. */
const INVOKE_CALLER_STEM = "b0271liveinvcaller";
/** Half (c)'s callee: prompt mode, so no direction of this fix can spawn a child. */
const PROMPT_CHILD_STEM = "b0271livepromptchild";
const CLEAN_STEM = "b0271liveclean";

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
 * The child, identical in both workspaces: `mode: subagent`, its OWN `tools:`
 * naming the grandchild by the same literal in both. The grandchild's BYTES are
 * the single structural difference between the offender and the control.
 */
const CHILD_SOURCE = [
  "---",
  "mode: subagent",
  "description: b0271live fixture child",
  "tools:",
  `  - ./${GRANDCHILD_STEM}.theta as gc`,
  "---",
  "let a = 1",
  "",
].join("\n");

/** The offender's grandchild: its own body carries an unterminated template. */
const BROKEN_GRANDCHILD_SOURCE = [
  "---",
  "mode: subagent",
  "description: b0271live fixture grandchild",
  "---",
  "let t = `unterminated",
  "let a = 1",
  "",
].join("\n");

/** The control's grandchild: the same frontmatter, a body that parses. */
const HEALTHY_GRANDCHILD_SOURCE = [
  "---",
  "mode: subagent",
  "description: b0271live fixture grandchild",
  "---",
  "let a = 1",
  "",
].join("\n");

/**
 * An unrelated, `tools:`-free theta present in BOTH workspaces. It is the
 * per-boot vacuity guard: a boot in which it fails to register has a discovery
 * or registration regression, and no absence claim below means anything. It is
 * never driven, so it spends no tokens.
 */
const CLEAN_SOURCE = ["---", "mode: prompt", "---", "@`ping`", ""].join("\n");

/**
 * Half (c)'s callee: PROMPT mode carrying the same grandchild entry as the
 * subagent child above. Prompt mode is deliberate — the gate under test runs
 * before `#driveCallee`'s mode branch, so this file reaches it in full while
 * keeping the half spawn-free whichever way the fix lands.
 */
const PROMPT_CHILD_SOURCE = [
  "---",
  "mode: prompt",
  "description: b0271live fixture prompt child",
  "tools:",
  `  - ./${GRANDCHILD_STEM}.theta as gc`,
  "---",
  '"done"',
  "",
].join("\n");

/**
 * Half (c)'s caller: the prompt-mode child reached by a LITERAL `invoke(...)`
 * instead of a `tools:` entry. `docs/spec_topics/invocation.md` §Static
 * resolution, line 22, makes that surface warning severity, so this file
 * registers in both workspaces — which is what leaves a real dispatch to
 * observe. Its body carries no `@`-query, so driving it issues no provider turn;
 * `?` propagates the callee's `Err` out of the theta and onto the
 * `theta-system-note` channel (SLSH-3).
 */
const INVOKE_CALLER_SOURCE = [
  "---",
  "mode: prompt",
  "---",
  `invoke("./${PROMPT_CHILD_STEM}.theta")?`,
  "",
].join("\n");

/** The five files that are byte-identical across both workspaces. */
const SHARED_THETAS: readonly PlantedTheta[] = [
  { source: "project", stem: GRANDPARENT_STEM, text: GRANDPARENT_SOURCE },
  { source: "project", stem: CHILD_STEM, text: CHILD_SOURCE },
  { source: "project", stem: PROMPT_CHILD_STEM, text: PROMPT_CHILD_SOURCE },
  { source: "project", stem: INVOKE_CALLER_STEM, text: INVOKE_CALLER_SOURCE },
  { source: "project", stem: CLEAN_STEM, text: CLEAN_SOURCE },
];

/**
 * Plant the five shared fixture files plus the grandchild, broken or healthy.
 * The five are byte-identical across both calls, so the grandchild's bytes are
 * the single difference between the offender and the control.
 */
function plantWorkspace(grandchildParses: boolean): LiveWorkspace {
  return plantThetaWorkspace([
    ...SHARED_THETAS,
    {
      source: "project",
      stem: GRANDCHILD_STEM,
      text: grandchildParses ? HEALTHY_GRANDCHILD_SOURCE : BROKEN_GRANDCHILD_SOURCE,
    },
  ]);
}

// ── Registry oracle (DIAG-4) ────────────────────────────────────────────────

interface RegistryRow {
  code: string;
  message: string;
}

function loadRegistry(page: string): RegistryRow[] {
  return parseRegistry(
    readFileSync(
      fileURLToPath(new URL(`../../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
      "utf8",
    ),
  ) as RegistryRow[];
}

const LOAD_REGISTRY = loadRegistry("code-registry-load.md");
const PARSE_REGISTRY = loadRegistry("code-registry-parse.md");

/**
 * The row's normative *Message* (DIAG-4) as a regex with the `<placeholder>`
 * slots opened up. Fails loudly naming the registry page when the row is absent,
 * so registry drift can never degrade a presence assertion into a comparison
 * against `undefined`.
 */
function normativeMessagePattern(registry: RegistryRow[], page: string, code: string): RegExp {
  const message = registryMessage(registry, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    failLoudly(
      "bug-0271 live cell precondition unmet: " +
        `docs/spec_topics/diagnostics/${page} carries no Message row for ${code} — the DIAG-4 ` +
        "column is this cell's only message oracle, so a missing row is a harness failure, " +
        "never a skip",
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
      `bug-0271 live cell precondition unmet: the ${half} boot appended NO ` +
        "`theta-system-note` entries, so the shipped load-diagnostic channel is unobservable " +
        "here. Registered: " + JSON.stringify(handle.registeredNames()),
    );
  }
}

describe("bug 0271 live cell — a `tools:` grandparent does not register over a child whose own `tools:` names a grandchild that fails its own checks, at live production load", () => {
  it("the grandparent of a dropped grandchild is absent from the registered set and carries theta/load/callee-has-errors at its own file, while the byte-neighbour healthy three-level chain all registers and the grandparent drives", async () => {
    const provider = await requireLiveProvider();

    // ── (a) THE OFFENDER: same bytes, the grandchild does not parse ────────
    const offenderWorkspace = plantWorkspace(false);
    const offender = await bootShippedExtension({ workspace: offenderWorkspace, provider });
    try {
      const offenderRegistered = JSON.stringify(offender.registeredNames());

      // Vacuity guard: an unrelated, `tools:`-free theta in the same boot.
      expect(
        offender.command(CLEAN_STEM),
        "bug-0271 live cell precondition unmet: the unrelated clean theta did not register in " +
          "the offender boot, so discovery or registration regressed independently of bug 0271 " +
          "and every absence claim below would hold vacuously. Registered: " + offenderRegistered,
      ).toBeDefined();

      requireNoteChannel(offender, "offender");

      // Precondition 1: the GRANDCHILD's own drop route fired, at its own file.
      const grandchildRows = rowsLocatedAt(
        offender,
        UNTERMINATED_TEMPLATE_CODE,
        GRANDCHILD_STEM,
      );
      expect(
        describeRows(grandchildRows),
        `bug-0271 live cell precondition unmet: no ${UNTERMINATED_TEMPLATE_CODE} row is located ` +
          "at the grandchild's own file, so the drop route at the bottom of the chain — the " +
          "premise of everything above it — did not fire. Notes: " +
          JSON.stringify(bootNotes(offender)),
      ).not.toEqual([]);
      expect(
        (grandchildRows[0] as RenderedRow).message,
        `the ${UNTERMINATED_TEMPLATE_CODE} line must carry the registry's normative Message ` +
          "(DIAG-4, read from docs/spec_topics/diagnostics/code-registry-parse.md, not " +
          "transcribed here)",
      ).toMatch(
        normativeMessagePattern(
          PARSE_REGISTRY,
          "code-registry-parse.md",
          UNTERMINATED_TEMPLATE_CODE,
        ),
      );

      // Precondition 2: bug 0267's landed DEPTH-1 behaviour — the child carries
      // its own caller-located row and does not register. This report changes no
      // depth-1 outcome (§Non-goals), and without this row the boot is measuring
      // some other condition.
      expect(
        describeRows(rowsLocatedAt(offender, CALLEE_HAS_ERRORS_CODE, CHILD_STEM)),
        `bug-0271 live cell precondition unmet: no ${CALLEE_HAS_ERRORS_CODE} row is located at ` +
          "the CHILD's own file, so bug 0267's depth-1 refusal — the condition this report " +
          "propagates one level up — did not fire. Notes: " + JSON.stringify(bootNotes(offender)),
      ).not.toEqual([]);
      expect(
        offender.registeredNames(),
        "an error-severity load diagnostic does not register the file that carries it; the " +
          "grandchild's and the child's own dispositions are correct pre-fix and must stay. " +
          "Registered: " + offenderRegistered,
      ).not.toContain(GRANDCHILD_STEM);
      expect(
        offender.registeredNames(),
        "bug 0267's landed depth-1 refusal must stay. Registered: " + offenderRegistered,
      ).not.toContain(CHILD_STEM);

      // THE FIXED OBSERVABLE. `docs/spec_topics/invocation.md` §Static
      // resolution, line 22: on the `tools:` surface "the callable cannot be
      // created, and the parent theta does not register". Pre-fix the
      // grandparent registered here and became an author-runnable slash command
      // offering a dead callable — with a frozen entry byte-identical to the
      // healthy control's — to the model.
      expect(
        offender.registeredNames(),
        "bug-0271 PRIMARY: the grandparent must not register over a child this same pass " +
          "un-registers. Pre-fix `calleeFailsOwnStructuralChecks` judged the child's own " +
          "`tools:` `.theta` entries for existence and readability alone, so the grandchild was " +
          "never opened, the V15f `callee-has-errors` loop had no subject at the grandparent, " +
          "and this name was present. Registered: " + offenderRegistered,
      ).not.toContain(GRANDPARENT_STEM);
      expect(
        offender.command(GRANDPARENT_STEM),
        "the same claim on the runner's own lookup: no slash command an author could run. " +
          "Registered: " + offenderRegistered,
      ).toBeUndefined();

      // The author-facing half of bug 0271 §Fix constraint 1: a row LOCATED AT
      // THE GRANDPARENT's `tools:` site, not only at the child and the
      // grandchild.
      const grandparentRows = rowsLocatedAt(offender, CALLEE_HAS_ERRORS_CODE, GRANDPARENT_STEM);
      expect(
        describeRows(grandparentRows),
        `bug-0271: an error-severity ${CALLEE_HAS_ERRORS_CODE} row must be located at the ` +
          "GRANDPARENT's own file — pre-fix the author's whole load report named the child and " +
          "the grandchild, and nothing said the grandparent's `tools:` entry was dead. Notes: " +
          JSON.stringify(bootNotes(offender)),
      ).not.toEqual([]);
      expect(
        (grandparentRows[0] as RenderedRow).message,
        `the ${CALLEE_HAS_ERRORS_CODE} line must carry the registry's normative Message ` +
          "(DIAG-4, read from docs/spec_topics/diagnostics/code-registry-load.md, line 42, not " +
          "transcribed here)",
      ).toMatch(
        normativeMessagePattern(LOAD_REGISTRY, "code-registry-load.md", CALLEE_HAS_ERRORS_CODE),
      );

      // ── (c) THE DISPATCH-GATE HALF, on this same offender boot ─────────
      // Bug 0271 §Fix constraint 5: one predicate, both sites. The terminal
      // outcome of a drive that STILL reaches dispatch is settled here, by a
      // real run.
      expect(
        offender.command(INVOKE_CALLER_STEM),
        "bug-0271 live cell precondition unmet: the literal-`invoke(...)` caller did not " +
          "register, so the warning-severity surface — the only one that still reaches " +
          "`parseCalleeTheta` after this fix — cannot be driven and the terminal-outcome claim " +
          "below has no subject. Registered: " + offenderRegistered,
      ).toBeDefined();

      const drivenInvoke = await driveSlashCaptureTurn(offender, `/${INVOKE_CALLER_STEM}`);
      expect(
        drivenInvoke.systemNotes.some(
          (note) =>
            note.includes(`theta /${INVOKE_CALLER_STEM} returned Err: invoke of`) &&
            note.includes(`./${PROMPT_CHILD_STEM}.theta`) &&
            note.includes("failed (load_failure)"),
        ),
        "bug-0271 §Fix constraint 5: the dispatch gate must refuse a callee whose own `tools:` " +
          "names a grandchild that fails its own checks, so this drive ends in " +
          "Err(InvokeInfraError { cause: 'load_failure' }) — the `#driveCallee` arm taken " +
          "exactly when `parseCallee` returns `undefined`. Notes: " +
          JSON.stringify(drivenInvoke.systemNotes),
      ).toBe(true);
    } finally {
      await offender.dispose();
      offenderWorkspace.dispose();
    }

    // ── (b) THE BYTE-NEIGHBOUR CONTROL: same bytes, the grandchild parses ──
    const controlWorkspace = plantWorkspace(true);
    const control = await bootShippedExtension({ workspace: controlWorkspace, provider });
    try {
      const controlRegistered = JSON.stringify(control.registeredNames());

      // All three levels register. This is what a recursive predicate must not
      // cost: the only difference from the offender workspace is the
      // grandchild's body, beside byte-identical fixture files.
      expect(
        control.command(GRANDCHILD_STEM),
        "the healthy grandchild must register on its own merits. Registered: " +
          controlRegistered,
      ).toBeDefined();
      expect(
        control.command(CHILD_STEM),
        "the healthy child must register — its own `tools:` entry names a grandchild that " +
          "parses. Registered: " + controlRegistered,
      ).toBeDefined();
      expect(
        control.command(GRANDPARENT_STEM),
        "bug-0271 separability control: the grandparent of a HEALTHY three-level chain must " +
          "keep registering, so the offender's absence is the recursive predicate's doing and " +
          "not a `tools:` surface that refuses everything. Registered: " + controlRegistered,
      ).toBeDefined();

      // No row anywhere in the healthy boot.
      expect(
        describeRows(renderedRows(control, CALLEE_HAS_ERRORS_CODE)),
        `a healthy chain must draw no ${CALLEE_HAS_ERRORS_CODE} row anywhere. Notes: ` +
          JSON.stringify(bootNotes(control)),
      ).toEqual([]);
      expect(
        describeRows(renderedRows(control, UNTERMINATED_TEMPLATE_CODE)),
        `a grandchild that parses must draw no ${UNTERMINATED_TEMPLATE_CODE} row anywhere. ` +
          "Notes: " + JSON.stringify(bootNotes(control)),
      ).toEqual([]);

      // The registered grandparent RUNS. `userTexts` is the deterministic
      // outbound render — the exact text the theta code computed and sent — and
      // it carries a number only the theta's own evaluation could produce, so it
      // discriminates a real turn over a real computed value. The absence of a
      // fail-closed note is what proves the drive ended cleanly rather than
      // merely resolving.
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
