import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  composeExtensionInstance,
} from "../src/extension/production-composition";
import { RendererGate } from "../src/extension/system-note-channel";
import {
  hashCallableClosure,
  SUBAGENT_CALLABLE_HASHES_ENV,
} from "../src/runtime/subagent-callable-hash";
import { SUBAGENT_PARENT_PID_ENV } from "../src/runtime/subagent-launcher";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";

// Bug 0329 — a child-side callable-hash mismatch DETECTS but does not ENFORCE.
// subagent.md #subagent-theta-callable-hash: the child "verifies each hash after
// its own parse and **refuses the invocation on mismatch** with a precise
// diagnostic (`theta/runtime/subagent-callable-hash-mismatch`, fail-closed)".
// One child process serves exactly one invocation, so "the invocation" is the
// child's run of the marked root. At HEAD the child-side refusal
// (`refuseDivergedChildCallables`, src/extension/production-composition.ts) only
// FILTERS the diverged callee out of the discovered-theta list — the set that
// feeds `pi.registerCommand`. A subagent child dispatches nothing by slash
// except the marked root; the root dispatches its callables through its OWN
// frozen callable-set entry, re-parsed from disk at dispatch. So dropping the
// callee from the registry removes nothing the invocation uses: the marked root
// still registers, `markedRootRegistrationRefusal`
// (src/runtime/subagent-root-regime.ts) sees the root in `registeredSlugs` and
// emits NO envelope, and the parent — which reads only the PIC-59 envelope —
// cannot tell the run from a clean one.
//
// Fix (Option A, settled — bug 0329 §Fix): on ANY refusal in
// `refuseDivergedChildCallables`, ALSO drop the marked root from the survivors
// so `markedRootRegistrationRefusal` fires and the parent receives
// `Err(InvokeInfraError { cause: "load_failure" })` whose message names
// `theta/runtime/subagent-callable-hash-mismatch`. The refusal is attributed to
// the marked root's own file (design edit 2), so per subagent.md §"Marked-root
// registration refusal" the envelope's FIRST arm names that diagnostic's code
// and message. Additionally the callee-locate compare inside the drop is case-folded
// (canonical real paths) so a case-mismatched `tools:` spec on a
// case-insensitive filesystem still locates and drops the callee alongside the
// root (bug 0329 coordination note, 2026-08-30).
//
// TIER: unit — offline, provider-free, deterministic. These cells reach the
// shipped composition root (`composeExtensionInstance`) over planted files with
// the authenticated control-plane env planted; no provider, no child process,
// no live model. The `discoverAndComposeFixtures` e2e harness the sibling file
// uses installs a NO-OP envelope writer, so it cannot observe the PIC-59
// `load_failure` envelope Option A owes — hence `composeExtensionInstance` with
// a capturing `emitResultEnvelope`, whose `.thetas` wiring is the registration
// observable (mirrors
// tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts).
//
// No silent skipping: an unmet precondition (fixture absent, FS case-probe
// inconclusive) fails the surrounding assertion loudly; there is no early
// return or vitest skip anywhere below. The FS case-probe (cell D) runs REAL
// assertions on BOTH branches.
//
// Every `0.322.0` in a comment is the literal placeholder the fix's version fills.

const HASH_MISMATCH_DIAGNOSTIC_CODE = "theta/runtime/subagent-callable-hash-mismatch";

// ── Fixtures (bug 0329 §Reproduction) ────────────────────────────────────────
// Double-quoted so `${…}` and backticks stay literal `.theta` body text rather
// than TS interpolation.

/** The marked root: one `.theta` callable, correctly cased. */
const ZQX_MAIN =
  "---\nmode: subagent\ntools:\n  - ./zqx-helper.theta\n---\nlet r = zqx_helper(\"hi\")\n@`use ${r}`\n";
/** The subagent-mode callee the parent would have marshalled a closure hash for. */
const ZQX_HELPER =
  "---\nmode: subagent\nparams:\n  q: string\n---\n@`helper ${q}`\n";

// ── Compose host double (mirrors the callee-tools sibling's makeHost) ─────────

interface ComposeHost {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  /** Every `pi.sendMessage` note the pass delivered (the channel arm). */
  readonly notes: string[];
  /** Every `ctx.ui.notify` toast (the off-channel fallback arm). */
  readonly notified: string[];
}

function makeComposeHost(cwd: string): ComposeHost {
  const notes: string[] = [];
  const notified: string[] = [];
  const pi = {
    registerFlag: (): void => {},
    getFlag: (): undefined => undefined,
    getCommands: (): readonly { name: string; source: string }[] => [],
    on: (): void => {},
    registerCommand: (): void => {},
    sendMessage: (message: { content: string }): void => {
      notes.push(message.content);
    },
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string): void => {
        notified.push(message);
      },
    },
  } as unknown as ExtensionContext;
  return { pi, ctx, notes, notified };
}

interface ComposeOutcome {
  readonly registered: readonly string[];
  /** The raw PIC-59 envelope lines the pass emitted, in order. */
  readonly envelopes: readonly string[];
  readonly notes: readonly string[];
  readonly notified: readonly string[];
}

/**
 * Drive the shipped composition root over the planted workspace with a
 * capturing envelope writer and an undegraded `RendererGate` (every note takes
 * the transcript / `pi.sendMessage` arm). Returns the registered slash names,
 * the captured envelope lines, and both note channels.
 */
async function runCompose(cwd: string): Promise<ComposeOutcome> {
  const host = makeComposeHost(cwd);
  const envelopes: string[] = [];
  const wiring = await composeExtensionInstance(
    host.pi,
    host.ctx,
    {
      emitResultEnvelope: (line: string): void => {
        envelopes.push(line);
      },
    },
    new RendererGate(),
  );
  return {
    registered: wiring.thetas.map((theta) => theta.slashName),
    envelopes,
    notes: host.notes,
    notified: host.notified,
  };
}

/** The parsed `err` arm of every captured `{ theta_result: { v, err } }` line. */
interface EnvelopeErr {
  readonly kind?: string;
  readonly cause?: string;
  readonly message?: string;
  readonly callee_path?: string;
}

function errEnvelopes(envelopes: readonly string[]): readonly EnvelopeErr[] {
  const errs: EnvelopeErr[] = [];
  for (const line of envelopes) {
    const parsed = JSON.parse(line) as {
      theta_result?: { err?: EnvelopeErr };
    };
    const err = parsed.theta_result?.err;
    if (err !== undefined) {
      errs.push(err);
    }
  }
  return errs;
}

/** The single `load_failure` envelope Option A owes, or throws naming its absence. */
function loadFailureEnvelope(outcome: ComposeOutcome): EnvelopeErr {
  const loadFailures = errEnvelopes(outcome.envelopes).filter(
    (err) => err.cause === "load_failure",
  );
  // RED-pre-fix reason: HEAD registers the marked root, so
  // `markedRootRegistrationRefusal` returns undefined and NO envelope is
  // emitted — `loadFailures` is empty and this throw is the pre-fix failure.
  expect(
    loadFailures.length,
    `exactly one load_failure envelope expected; captured envelopes: ${JSON.stringify(outcome.envelopes)}`,
  ).toBe(1);
  return loadFailures[0]!;
}

// ── Workspace ────────────────────────────────────────────────────────────────

let workspaceDir: string;
let thetaDir: string;
const savedEnv: Record<string, string | undefined> = {};

function setEnv(key: string, value: string): void {
  if (!(key in savedEnv)) {
    savedEnv[key] = process.env[key];
  }
  process.env[key] = value;
}

function plant(name: string, content: string): void {
  writeFileSync(join(thetaDir, name), content, "utf8");
}

/**
 * Plant the authenticated control-plane env a real launcher writes: the marked
 * root slug, the parent-pid carriage (`readParentEnv` honours `PI_THETA_*` only
 * when it names the reading process's real parent — subagent.md
 * #subagent-control-plane-authentication), and the marshalled hash map.
 */
function plantChildEnv(rootSlug: string, hashes: Record<string, string>): void {
  setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
  setEnv(SUBAGENT_ROOT_ENV_MARKER, rootSlug);
  setEnv(SUBAGENT_CALLABLE_HASHES_ENV, JSON.stringify(hashes));
}

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "b0329-"));
  thetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });
  // A minimal valid settings file pins the settings read (an ABSENT file is
  // silent per package-and-settings.md §Failure modes) — hermeticity, not noise
  // suppression, matching the sibling harnesses.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
    delete savedEnv[key];
  }
  rmSync(workspaceDir, { recursive: true, force: true });
});

// =============================================================================
// (A) A mismatch REFUSES THE INVOCATION: the load_failure envelope names the
//     hash-mismatch diagnostic, and the marked root does not register.
// =============================================================================

describe("bug 0329 (A) — a callable-hash mismatch refuses the invocation (envelope + root drop)", () => {
  it("emits the PIC-59 load_failure envelope naming the mismatch and drops the marked root", async () => {
    plant("zqx-main.theta", ZQX_MAIN);
    plant("zqx-helper.theta", ZQX_HELPER);
    // The presented name for `./zqx-helper.theta` is `zqx_helper`
    // (`thetaDefaultName`, src/parser/callable-set.ts: basename minus `.theta`,
    // hyphens→underscores). Marshal a STALE hash under it, as if the helper was
    // edited between parent load and child spawn.
    plantChildEnv("zqx-main", { zqx_helper: "sha256:stale-parent-hash" });

    const outcome = await runCompose(workspaceDir);

    // The envelope the parent settles on. RED pre-fix: HEAD emits none (the root
    // registers, so `markedRootRegistrationRefusal` returns undefined) —
    // `loadFailureEnvelope` throws on the empty capture. GREEN post-fix: Option A
    // drops the root, the refusal fires, and the envelope's message names the
    // hash-mismatch diagnostic (design edit 2 attributes the refusal to the
    // root's own file so the first arm renders the code).
    const err = loadFailureEnvelope(outcome);
    expect(err.kind).toBe("invoke_infra");
    expect(err.cause).toBe("load_failure");
    expect(err.message ?? "").toContain(HASH_MISMATCH_DIAGNOSTIC_CODE);

    // RED pre-fix: HEAD registers `zqx-main` (the root survives a callee
    // mismatch). GREEN post-fix: Option A drops it, so the invocation is
    // undispatchable.
    expect(
      outcome.registered,
      `registered: ${JSON.stringify(outcome.registered)}`,
    ).not.toContain("zqx-main");
  });
});

// =============================================================================
// (B) The grandchild-laundering fence: the refused invocation never reaches the
//     root body, so no grandchild is spawned. The strongest observable this
//     load-pass harness exposes is that the root is NOT registered —
//     unregistered ⇒ undispatchable ⇒ the root body never runs ⇒ no grandchild
//     launch. Root-absent IS the fence: there is no dispatch surface for the
//     root body.
// =============================================================================

describe("bug 0329 (B) — the refused root is unregistered, so its body (and any grandchild) never runs", () => {
  it("drops both the marked root and the diverged callee from the dispatch surface", async () => {
    plant("zqx-main.theta", ZQX_MAIN);
    plant("zqx-helper.theta", ZQX_HELPER);
    plantChildEnv("zqx-main", { zqx_helper: "sha256:stale-parent-hash" });

    const outcome = await runCompose(workspaceDir);

    // RED pre-fix on the root: HEAD leaves `zqx-main` registered, so its body
    // remains dispatchable and would dispatch-parse the edited `zqx-helper.theta`
    // and spawn the grandchild the parent never validated. GREEN post-fix: the
    // root is absent — no dispatch surface, no grandchild.
    expect(
      outcome.registered,
      `registered: ${JSON.stringify(outcome.registered)}`,
    ).not.toContain("zqx-main");
    // Belt: the diverged callee is also gone. This arm is already GREEN at HEAD
    // (the callee IS dropped from the registry today) — the RED that witnesses
    // the bug in this cell is the root-absent assertion above.
    expect(outcome.registered).not.toContain("zqx-helper");
  });
});

// =============================================================================
// (C) Clean-hash control: the CORRECT child-recomputed hash admits both root and
//     callee with no refusal. GREEN in BOTH tree states — the anchor proving the
//     fix does not false-refuse a matching closure.
// =============================================================================

describe("bug 0329 (C) — a matching closure hash admits the root and callee (control)", () => {
  it("marshals the correct closure hash: no envelope, root and callee register, no mismatch note", async () => {
    plant("zqx-main.theta", ZQX_MAIN);
    plant("zqx-helper.theta", ZQX_HELPER);
    // The child recomputes `zqx_helper`'s closure hash over the on-disk callee
    // bytes; the closure hash folds no path in (`hashCallableClosure` hashes
    // content only), so the byte-identical helper yields the identical hash the
    // parent marshals. Resolve `./zqx-helper.theta` against the root dir and read
    // its bytes, exactly as the b0330 match-admits cell computes its correct hash.
    const correctHash = hashCallableClosure([
      {
        path: join(thetaDir, "zqx-helper.theta"),
        content: readFileSync(join(thetaDir, "zqx-helper.theta"), "utf8"),
      },
    ]);
    plantChildEnv("zqx-main", { zqx_helper: correctHash });

    const outcome = await runCompose(workspaceDir);

    // GREEN in both states: pre-fix nothing refuses; post-fix the recomputed hash
    // matches, so Option A never triggers.
    expect(
      errEnvelopes(outcome.envelopes).filter((err) => err.cause === "load_failure"),
      `no load_failure envelope must be emitted for a matching hash; captured: ${JSON.stringify(outcome.envelopes)}`,
    ).toEqual([]);
    expect(outcome.registered).toContain("zqx-main");
    expect(outcome.registered).toContain("zqx-helper");
    expect(
      outcome.notes.filter((note) => note.includes("content hash mismatch")),
      "a matching hash must draw no mismatch note",
    ).toEqual([]);
  });
});

// =============================================================================
// (D) Case-fold. Probe the workspace filesystem's case-sensitivity by writing a
//     lowercase file and attempting the uppercase read, then run REAL assertions
//     on the branch that host exercises — never a skip. On a case-INSENSITIVE FS
//     an author-written case-mismatched `tools:` spec still hash-verifies (the FS
//     resolves the sources) but HEAD's case-SENSITIVE callee-locate compare
//     misses, so the callee is NOT dropped; the fix's case-folded compare locates
//     and drops it. On a case-SENSITIVE FS the exact/realpath compare already
//     locates the callee, and a DISTINCT case-only sibling must NOT be dropped
//     (proving the compare does not blindly case-fold there).
//
//     Whether this cell reds pre-fix depends on the branch:
//       - case-INSENSITIVE (this host, Windows/NTFS): BOTH assertions red — the
//         root stays registered (Option A absent) AND the callee stays registered
//         (the case-sensitive find misses). Correct-reason RED on both arms.
//       - case-SENSITIVE: the root-absent arm reds pre-fix (Option A absent); the
//         callee-absent arm is GREEN pre-fix (exact compare already locates it),
//         so the case-fold half of this cell is green-after-only there.
// =============================================================================

/**
 * Whether the workspace filesystem is case-insensitive: write a lowercase file,
 * attempt the uppercase read. A successful read ⇒ case-insensitive. Only ENOENT
 * is the case-sensitive signal; any other error is a real fault and rethrows
 * (no swallow — CLAUDE.md/AGENTS.md "let crash"). The probe file lives in the
 * per-test tmp workspace and is removed with it.
 */
function filesystemIsCaseInsensitive(dir: string): boolean {
  const lower = join(dir, "b0329-case-probe-aa");
  writeFileSync(lower, "x", "utf8");
  try {
    readFileSync(join(dir, "b0329-case-probe-AA"), "utf8");
    return true;
  } catch (probeError: unknown) {
    const code = (probeError as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw probeError;
    }
    return false;
  } finally {
    rmSync(lower, { force: true });
  }
}

describe("bug 0329 (D) — the callee-locate compare is case-folded so a mis-cased `tools:` spec still drops the callee", () => {
  it("drops the root and the callee on the branch this filesystem exercises (both branches assert loudly)", async () => {
    const caseInsensitive = filesystemIsCaseInsensitive(workspaceDir);

    if (caseInsensitive) {
      // MIS-CASED `tools:` spec; the real file is all-lowercase. The spec's
      // first letter stays lowercase (`zqx-Helper`) so the derived name is
      // lowercase-first and passes `theta/load/invalid-derived-tool-name` — the
      // mis-casing is confined to a LATER letter (`H` vs the file's `h`), which
      // is the case skew this cell isolates and nothing else. On a
      // case-insensitive FS the spec resolves to the real file, so the root
      // registers and the hash verifies against the real bytes.
      plant(
        "zqx-main.theta",
        "---\nmode: subagent\ntools:\n  - ./zqx-Helper.theta\n---\nlet r = zqx_Helper(\"hi\")\n@`use ${r}`\n",
      );
      plant("zqx-helper.theta", ZQX_HELPER);
      // Presented name derives from the `tools:` SPELLING (`thetaDefaultName`,
      // src/parser/callable-set.ts): `./zqx-Helper.theta` → basename
      // `zqx-Helper.theta` → stem `zqx-Helper` → hyphens→underscores →
      // `zqx_Helper` (mid-word casing preserved). Marshal the STALE hash under
      // that key.
      plantChildEnv("zqx-main", { zqx_Helper: "sha256:stale-parent-hash" });

      const outcome = await runCompose(workspaceDir);

      // case-INSENSITIVE probe result asserted here so the branch is on the
      // record when this runs.
      expect(caseInsensitive, "case-insensitive filesystem branch").toBe(true);
      // RED pre-fix (Option A absent): the mis-cased spec resolves to the real
      // file and its derived name is valid, so the root registers today. Option A
      // drops it post-fix.
      expect(
        outcome.registered,
        `case-insensitive branch; registered: ${JSON.stringify(outcome.registered)}`,
      ).not.toContain("zqx-main");
      // RED pre-fix (case-fold absent): HEAD's case-SENSITIVE find compares
      // `.../zqx-helper.theta` (the discovered file's real casing) against
      // `.../ZQX-Helper.theta` (the spec's casing) and MISSES, so the callee stays
      // registered. The fix's canonical-realpath compare locates and drops it —
      // this callee-absent arm is what witnesses the case-fold.
      expect(
        outcome.registered,
        "the case-folded compare must locate and drop the mis-cased callee",
      ).not.toContain("zqx-helper");
    } else {
      // CORRECT casing on a case-sensitive FS; the exact/realpath compare locates
      // the referenced callee. A DISTINCT case-only sibling file
      // (`zqx-Helper.theta`, a different inode from `zqx-helper.theta` on a
      // case-sensitive FS) is NOT referenced by the root and must stay
      // registered — proving the compare does not blindly case-fold here.
      plant("zqx-main.theta", ZQX_MAIN);
      plant("zqx-helper.theta", ZQX_HELPER);
      plant("zqx-Helper.theta", ZQX_HELPER);
      plantChildEnv("zqx-main", { zqx_helper: "sha256:stale-parent-hash" });

      const outcome = await runCompose(workspaceDir);

      expect(caseInsensitive, "case-sensitive filesystem branch").toBe(false);
      // RED pre-fix (Option A absent): the root survives.
      expect(
        outcome.registered,
        `case-sensitive branch; registered: ${JSON.stringify(outcome.registered)}`,
      ).not.toContain("zqx-main");
      // GREEN pre-fix already: the exact compare drops the callee even today.
      expect(outcome.registered).not.toContain("zqx-helper");
      // The compare must NOT fold case on a case-sensitive FS: a distinct
      // case-only sibling the root never referenced stays registered.
      expect(
        outcome.registered,
        "an unreferenced case-only sibling must not be dropped",
      ).toContain("zqx-Helper");
    }
  });
});

// =============================================================================
// (E) Multi-callable ANY-refusal: a root with two `.theta` callables, one hash
//     correct and one stale, refuses the WHOLE invocation. A mismatch on ANY
//     marshalled callable drops the root.
// =============================================================================

describe("bug 0329 (E) — a mismatch on ANY marshalled callable refuses the whole invocation", () => {
  it("drops the root even though only one of two callables mismatched", async () => {
    plant(
      "zqx-main.theta",
      "---\nmode: subagent\ntools:\n  - ./a-tool.theta\n  - ./b-tool.theta\n---\nlet x = a_tool(\"hi\")\nlet y = b_tool(\"yo\")\n@`use ${x} ${y}`\n",
    );
    plant("a-tool.theta", ZQX_HELPER);
    plant("b-tool.theta", ZQX_HELPER);
    // CORRECT hash for `a_tool`, STALE for `b_tool`.
    const aHash = hashCallableClosure([
      {
        path: join(thetaDir, "a-tool.theta"),
        content: readFileSync(join(thetaDir, "a-tool.theta"), "utf8"),
      },
    ]);
    plantChildEnv("zqx-main", {
      a_tool: aHash,
      b_tool: "sha256:stale-parent-hash",
    });

    const outcome = await runCompose(workspaceDir);

    // RED pre-fix: HEAD drops only `b-tool` and leaves `zqx-main` registered with
    // no envelope. GREEN post-fix: the single `b_tool` mismatch drops the root,
    // and the parent gets the load_failure envelope.
    expect(
      outcome.registered,
      `registered: ${JSON.stringify(outcome.registered)}`,
    ).not.toContain("zqx-main");
    const err = loadFailureEnvelope(outcome);
    expect(err.cause).toBe("load_failure");
    expect(err.message ?? "").toContain(HASH_MISMATCH_DIAGNOSTIC_CODE);
  });
});
