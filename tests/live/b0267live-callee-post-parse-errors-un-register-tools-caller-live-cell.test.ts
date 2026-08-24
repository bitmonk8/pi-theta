// Bug 0267 — a prompt-mode caller's `tools:` `.theta` entry must not register
// over a subagent-mode callee the same load pass un-registers.
//
// Standalone live registration cell (the standalone-live-file precedent of
// `tests/live/unterminated-template-registration-live-cell.test.ts` and
// `tests/live/b0248live-nested-malformed-escape-live-cell.test.ts`; this lane's
// parent renumbers the H8a sequence of
// `tests/live/live-production-acceptance.test.ts` at merge, so this file carries
// no numeric id from that file's own cell sequence).
//
// TIER: H8a (live). The fixed surface is a REGISTRATION OUTCOME, and the
// registration outcome this bug moves is only fully observable after real
// discovery → real load → the real `pi.registerCommand` step of the shipped
// composition root. The offline witness
// (`tests/callee-post-parse-errors-un-register-tools-caller.test.ts`) reads
// `wiring.thetas` off `composeExtensionInstance` driven over host doubles, so
// its `pi` is a double whose `registerCommand` records nothing; it cannot show
// that the offender never becomes an author-runnable slash command on a real
// `ExtensionRunner`, and it drives no model turn, so it cannot show that the
// widened predicate leaves the healthy neighbour able to run. Those two claims
// are what this cell adds, and neither the unit nor an integration tier reaches
// them.
//
// WHAT THE CELL OBSERVES. Two boots over two workspaces whose `.theta` bytes are
// IDENTICAL — the pair differs only in whether the imported `.thetalib` exists:
//
//   (a) THE OFFENDER. `b0267livecaller.theta` is `mode: prompt` and its `tools:`
//       names `b0267livecallee.theta`, a `mode: subagent` callee importing
//       `./b0267livelib.thetalib`, which this workspace does not plant. IMP-1
//       (`docs/spec_topics/imports.md`, §IMP-1, line 23) un-registers the
//       importing file, and `docs/spec_topics/invocation.md` §Static resolution,
//       line 22, gives the parent's disposition on the `tools:` surface: a
//       callee that "fails its own structural checks is *not statically
//       resolvable*", so "the callable cannot be created, and the parent theta
//       does not register". PRE-FIX the caller registered anyway, because
//       `parseCalleeForTools` derived `hasErrors` from the callee's parse
//       document alone and the IMP-1 row is produced by `checkThetaImports`,
//       which that scan never ran. POST-FIX both files are absent from the
//       registered set and the caller carries an error-severity
//       `theta/load/callee-has-errors` row at its OWN file
//       (`docs/spec_topics/diagnostics/code-registry-load.md`, line 42, whose
//       Trigger already names this subject on this surface at this severity —
//       bug 0267 §Fix constraint 2 prefers that row over a newly minted code, so
//       no new registry row is asserted here).
//
//   (c) THE DISPATCH-GATE HALF, over the offender workspace's SAME boot. Bug
//       0267 §Fix constraint 6: "the permitted terminal codes for a drive that
//       still reaches dispatch are settled by a real run, not by derivation".
//       The `tools:` caller of (a) never registers, so it is never dispatched;
//       the surface that still reaches dispatch is the LITERAL
//       `invoke("./b0267livecallee.theta")` one, which
//       `docs/spec_topics/invocation.md` §Static resolution, line 22, makes
//       WARNING severity — "the parent registers, static checks against that
//       callee are skipped". `b0267liveinvcaller.theta` therefore registers in
//       both workspaces and is DRIVEN for real in the offender one, where the
//       widened predicate now refuses the callee at `parseCalleeTheta` and
//       `#driveCallee` takes its `parseCallee === undefined` arm. The terminal
//       outcome asserted is the one the offline cells
//       (`tests/callee-post-parse-errors-un-register-tools-caller.test.ts`,
//       cells 7-9) pin: an SLSH-3 err note reading `theta
//       /b0267liveinvcaller returned Err: invoke of ./b0267livecallee.theta
//       failed (load_failure)`. The drive spends no tokens — the invoke caller's
//       body carries no `@`-query, and the callee is refused before any child
//       spawn — so §Fix constraint 6 is discharged by a real host, real load and
//       real dispatch rather than by a model turn.
//
//   (b) THE BYTE-NEIGHBOUR HEALTHY CONTROL. The same three `.theta` files,
//       byte-for-byte, plus a healthy `b0267livelib.thetalib`. Caller AND callee
//       must both register, no `theta/load/callee-has-errors` row may appear,
//       and the caller must DRIVE a real turn. This is what keeps the widened
//       predicate from refusing every caller: without it (a)'s absence claim
//       would also hold for a fix that dropped the `tools:` surface entirely.
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
//      cannot report WHICH code a caller receives; this channel can.
//   3. The drive's `userTexts` (deterministic outbound render) and its
//      `systemNotes` (every fail-closed ending of a top-level drive lands
//      there). The model's arithmetic reply is stochastic and is not asserted.
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
// The control caller is prompt mode and exposes its callee to the model
// (`docs/spec_topics/frontmatter/frontmatter-fields-a.md`, line 74: `tools`
// declares the callable set exposed to both code and model), so a model turn MAY
// reach the RFC-0006 subagent child launch. `tests/live/harness.ts` sets all
// three ambient inputs at module scope — `process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN` and the `PI_THETA_SUBAGENT_PARENT_PID`
// carriage — and importing the harness inherits them.
//
// Token-bounded: one live turn, a fixed-pair arithmetic question (bug 0243
// retired the verbatim-echo drive sentinel; the discriminator here is the
// rendered outbound template, not the model's reply).

import { readFileSync, writeFileSync } from "node:fs";
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
const UNRESOLVABLE_THETALIB_CODE = "theta/load/unresolvable-thetalib-path";

const CALLER_STEM = "b0267livecaller";
const CALLEE_STEM = "b0267livecallee";
/** Half (c): the literal-`invoke(...)` caller — the warning-severity surface. */
const INVOKE_CALLER_STEM = "b0267liveinvcaller";
const CLEAN_STEM = "b0267liveclean";
const LIB_NAME = "b0267livelib.thetalib";

/** The arithmetic drive question — task-framed, no verbatim-echo demand (bug 0243). */
const DRIVE_QUESTION = "What is 263 plus 514? Answer with the number only.";

/**
 * The caller, identical in both workspaces: `mode: prompt`, one `tools:`
 * `.theta` entry naming the subagent-mode callee, and one `@`…`` query so the
 * healthy half has a real turn to drive.
 */
const CALLER_SOURCE = [
  "---",
  "mode: prompt",
  "tools:",
  `  - ./${CALLEE_STEM}.theta as callee`,
  "---",
  `let r = @\`${DRIVE_QUESTION}\`?`,
  "r",
  "",
].join("\n");

/**
 * The callee, identical in both workspaces: `mode: subagent`, importing the
 * library by the same literal in both. Every top-level `fn` in a `.thetalib` is
 * implicitly exported (`docs/spec_topics/imports.md`, §Visibility, line 27), so no
 * `export` statement stands between the import literal and the drop route.
 */
const CALLEE_SOURCE = [
  "---",
  "mode: subagent",
  "description: b0267live fixture callee",
  "---",
  `import { f } from "./${LIB_NAME}"`,
  "let a = f()",
  "",
].join("\n");

/** The library the control workspace plants and the offender workspace does not. */
const HEALTHY_LIB_SOURCE = "fn f() {\n  return 1\n}\n";

/**
 * An unrelated, import-free, `tools:`-free theta present in BOTH workspaces. It
 * is the per-boot vacuity guard: a boot in which it fails to register has a
 * discovery or registration regression, and no absence claim below means
 * anything. It is never driven, so it spends no tokens.
 */
const CLEAN_SOURCE = ["---", "mode: prompt", "---", "@`ping`", ""].join("\n");

/**
 * Half (c)'s caller: the same callee reached by a LITERAL `invoke(...)` instead
 * of a `tools:` entry. `docs/spec_topics/invocation.md` §Static resolution, line
 * 22, makes that surface warning severity, so this file registers in both
 * workspaces — which is what leaves a real dispatch to observe. Its body carries
 * no `@`-query, so driving it issues no provider turn; `?` propagates the
 * callee's `Err` out of the theta and onto the `theta-system-note` channel
 * (SLSH-3).
 */
const INVOKE_CALLER_SOURCE = [
  "---",
  "mode: prompt",
  "---",
  `invoke("./${CALLEE_STEM}.theta")?`,
  "",
].join("\n");

const THETAS: readonly PlantedTheta[] = [
  { source: "project", stem: CALLER_STEM, text: CALLER_SOURCE },
  { source: "project", stem: CALLEE_STEM, text: CALLEE_SOURCE },
  { source: "project", stem: INVOKE_CALLER_STEM, text: INVOKE_CALLER_SOURCE },
  { source: "project", stem: CLEAN_STEM, text: CLEAN_SOURCE },
];

/**
 * Plant the three `.theta` files, and the `.thetalib` only when `withLibrary`.
 * The `.theta` bytes are identical across both calls, so the library's presence
 * is the single difference between the offender and the control.
 */
function plantWorkspace(withLibrary: boolean): LiveWorkspace {
  const workspace = plantThetaWorkspace(THETAS);
  if (withLibrary) {
    // `plantThetaWorkspace` writes `<stem>.theta` only; the library is written
    // beside them into the same project source directory it creates.
    writeFileSync(join(workspace.cwd, ".pi", "theta", LIB_NAME), HEALTHY_LIB_SOURCE, "utf8");
  }
  return workspace;
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
      "bug-0267 live cell precondition unmet: " +
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

/** The boot put SOMETHING on the note channel, so an absence claim is not read off a dead channel. */
function requireNoteChannel(handle: LiveExtensionHandle, half: string): void {
  if (bootNotes(handle).length === 0) {
    failLoudly(
      `bug-0267 live cell precondition unmet: the ${half} boot appended NO ` +
        "`theta-system-note` entries, so the shipped load-diagnostic channel is unobservable " +
        "here. Registered: " + JSON.stringify(handle.registeredNames()),
    );
  }
}

describe("bug 0267 live cell — a `tools:` caller does not register over a callee whose missing `.thetalib` un-registers it, at live production load", () => {
  it("the caller of the IMP-1 callee is absent from the registered set and carries theta/load/callee-has-errors, while the byte-neighbour healthy pair both register and the caller drives", async () => {
    const provider = await requireLiveProvider();

    // ── (a) THE OFFENDER: same bytes, library absent ──────────────────────
    const offenderWorkspace = plantWorkspace(false);
    const offender = await bootShippedExtension({ workspace: offenderWorkspace, provider });
    try {
      const offenderRegistered = JSON.stringify(offender.registeredNames());

      // Vacuity guard: an import-free, `tools:`-free theta in the same boot.
      expect(
        offender.command(CLEAN_STEM),
        "bug-0267 live cell precondition unmet: the unrelated clean theta did not register in " +
          "the offender boot, so discovery or registration regressed independently of bug 0267 " +
          "and every absence claim below would hold vacuously. Registered: " + offenderRegistered,
      ).toBeDefined();

      requireNoteChannel(offender, "offender");

      // Precondition: the callee's OWN drop route fired. IMP-1
      // (`docs/spec_topics/imports.md`, §IMP-1, line 23) emits
      // `theta/load/unresolvable-thetalib-path` against the importing file and
      // does not register it. Without this row the boot is measuring some other
      // condition.
      const impRows = rowsLocatedAt(offender, UNRESOLVABLE_THETALIB_CODE, CALLEE_STEM);
      expect(
        impRows.map((row) => `${row.location}: ${row.message}`),
        `bug-0267 live cell precondition unmet: no ${UNRESOLVABLE_THETALIB_CODE} row is located ` +
          "at the callee's own file, so the callee's drop route — the premise of the caller-side " +
          "claim — did not fire. Notes: " + JSON.stringify(bootNotes(offender)),
      ).not.toEqual([]);
      expect(
        offender.registeredNames(),
        "IMP-1 does not register the importing file; the callee's own disposition is correct " +
          "pre-fix and must stay. Registered: " + offenderRegistered,
      ).not.toContain(CALLEE_STEM);

      // THE FIXED OBSERVABLE. `docs/spec_topics/invocation.md` §Static
      // resolution, line 22: on the `tools:` surface "the callable cannot be
      // created, and the parent theta does not register". Pre-fix the caller
      // registered here and became an author-runnable slash command offering a
      // dead callable to the model.
      expect(
        offender.registeredNames(),
        "bug-0267 PRIMARY: the caller must not register over a callee this same pass " +
          "un-registers. Pre-fix `parseCalleeForTools` derived its `hasErrors` from the callee's " +
          "parse document alone, which the IMP-1 row never reaches (that row is produced by " +
          "`checkThetaImports` in `src/extension/import-static-checks.ts`), so the V15f " +
          "`callee-has-errors` loop had no subject and this name was present. Registered: " +
          offenderRegistered,
      ).not.toContain(CALLER_STEM);
      expect(
        offender.command(CALLER_STEM),
        "the same claim on the runner's own lookup: no slash command an author could run. " +
          "Registered: " + offenderRegistered,
      ).toBeUndefined();

      // The author-facing half of bug 0267 §Fix constraint 1: a row LOCATED AT
      // THE CALLER's `tools:` site, not only at the callee or its library.
      const callerRows = rowsLocatedAt(offender, CALLEE_HAS_ERRORS_CODE, CALLER_STEM);
      expect(
        callerRows.map((row) => `${row.location}: ${row.message}`),
        `bug-0267: an error-severity ${CALLEE_HAS_ERRORS_CODE} row must be located at the ` +
          "CALLER's own file — pre-fix the author's whole load report named the callee and its " +
          "library, and nothing said the caller's `tools:` entry was dead. Notes: " +
          JSON.stringify(bootNotes(offender)),
      ).not.toEqual([]);
      expect(
        (callerRows[0] as RenderedRow).message,
        `the ${CALLEE_HAS_ERRORS_CODE} line must carry the registry's normative Message ` +
          "(DIAG-4, read from docs/spec_topics/diagnostics/code-registry-load.md, line 42, not " +
          "transcribed here)",
      ).toMatch(normativeMessagePattern(CALLEE_HAS_ERRORS_CODE));

      // ── (c) THE DISPATCH-GATE HALF, on this same offender boot ─────────
      // Bug 0267 §Fix constraint 6: the permitted terminal code for a drive that
      // STILL reaches dispatch is settled here, by a real run.
      expect(
        offender.command(INVOKE_CALLER_STEM),
        "bug-0267 live cell precondition unmet: the literal-`invoke(...)` caller did not " +
          "register, so the warning-severity surface — the only one that still reaches " +
          "`parseCalleeTheta` after this fix — cannot be driven and the terminal-code claim " +
          "below has no subject. Registered: " + offenderRegistered,
      ).toBeDefined();

      const drivenInvoke = await driveSlashCaptureTurn(offender, `/${INVOKE_CALLER_STEM}`);
      expect(
        drivenInvoke.systemNotes.some(
          (note) =>
            note.includes(`theta /${INVOKE_CALLER_STEM} returned Err: invoke of`) &&
            note.includes(`./${CALLEE_STEM}.theta`) &&
            note.includes("failed (load_failure)"),
        ),
        "bug-0267 §Fix constraint 6: the dispatch gate must refuse a callee whose own " +
          "post-parse checks fail, so this drive ends in " +
          "Err(InvokeInfraError { cause: 'load_failure' }) — the `#driveCallee` arm taken " +
          "exactly when `parseCallee` returns `undefined`. The offline cells " +
          "(`tests/callee-post-parse-errors-un-register-tools-caller.test.ts`, cells 7-9) pin " +
          "the same disposition; this is the real-run adjudication of it. Notes: " +
          JSON.stringify(drivenInvoke.systemNotes),
      ).toBe(true);
    } finally {
      await offender.dispose();
      offenderWorkspace.dispose();
    }

    // ── (b) THE BYTE-NEIGHBOUR CONTROL: same bytes, library present ───────
    const controlWorkspace = plantWorkspace(true);
    const control = await bootShippedExtension({ workspace: controlWorkspace, provider });
    try {
      const controlRegistered = JSON.stringify(control.registeredNames());

      // Both halves register. This is what a widened predicate must not cost:
      // the only difference from the offender workspace is a healthy
      // `.thetalib` beside byte-identical `.theta` files.
      expect(
        control.command(CALLEE_STEM),
        "the healthy callee must register — its import resolves. Registered: " + controlRegistered,
      ).toBeDefined();
      expect(
        control.command(CALLER_STEM),
        "bug-0267 separability control: the caller of a HEALTHY callee must keep registering, " +
          "so the offender's absence is the widened predicate's doing and not a `tools:` surface " +
          "that refuses everything. Registered: " + controlRegistered,
      ).toBeDefined();

      // No caller-located row in the healthy boot.
      expect(
        renderedRows(control, CALLEE_HAS_ERRORS_CODE).map(
          (row) => `${row.location}: ${row.message}`,
        ),
        `a healthy callee must draw no ${CALLEE_HAS_ERRORS_CODE} row anywhere. Notes: ` +
          JSON.stringify(bootNotes(control)),
      ).toEqual([]);

      // The registered caller RUNS. `userTexts` is the deterministic outbound
      // render — the exact text the theta code computed and sent — and the
      // absence of a fail-closed note is what proves the drive ended cleanly
      // rather than merely resolving.
      const driven = await driveSlashCaptureTurn(control, `/${CALLER_STEM}`);
      expect(
        driven.userTexts.join("\n"),
        "the caller's QRY-18 rendered template is the deterministic outbound-render channel; " +
          "its absence means the query never reached the provider, so no real model turn ran. " +
          "Observed: " + JSON.stringify(driven.userTexts),
      ).toContain(DRIVE_QUESTION);
      expect(
        driven.systemNotes,
        "every fail-closed ending of a top-level drive lands on the theta-system-note channel " +
          "(the SLSH-3 err note, the cancelled note, the panic framings); the healthy caller must " +
          "end with none. Observed: " + JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await control.dispose();
      controlWorkspace.dispose();
    }
  });
});
