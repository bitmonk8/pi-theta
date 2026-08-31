import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import { hashCallableClosure } from "../src/runtime/subagent-callable-hash";
import { SUBAGENT_CALLABLE_HASHES_ENV } from "../src/runtime/subagent-callable-hash";
import { SUBAGENT_PARENT_PID_ENV } from "../src/runtime/subagent-launcher";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";


// RFC-0005 — child-side `.theta` callable content-hash verification, wired into
// the production child load path (subagent.md #subagent-theta-callable-hash).
// One child process serves one subagent invocation, so a fail-closed refusal
// recorded during the child's discovery pass refuses that invocation: the
// diverged callable is dropped from the child's registration and its
// `theta/runtime/subagent-callable-hash-mismatch` diagnostic surfaces.

const HASH_MISMATCH_MSG =
  "subagent callable 'code_review' content hash mismatch; refusing invocation";

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
}

let workspaceDir: string;
const savedEnv: Record<string, string | undefined> = {};

function setEnv(key: string, value: string): void {
  savedEnv[key] = process.env[key];
  process.env[key] = value;
}

async function runChildLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    getAllTools: (): readonly unknown[] => [],
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
  return { registered: fixtures.map((f) => f.slashName), notifications };
}

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-rfc0005-hashref-"));
  const dir = join(workspaceDir, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  // A subagent-mode callee the parent would have marshalled a closure hash for.
  writeFileSync(
    join(dir, "code-review.theta"),
    "---\nmode: subagent\n---\n@`review`\n",
    "utf8",
  );
  writeFileSync(
    join(dir, "helper.theta"),
    "---\nmode: subagent\n---\n@`help`\n",
    "utf8",
  );
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md
  // §Failure modes), so the plant is hermeticity, not noise suppression.
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

describe("RFC-0005 — child refuses a callee whose content-hash diverged", () => {
  it("drops the diverged callable and surfaces the registry-pinned diagnostic", async () => {
    // Marshal a STALE hash for `code_review` (as if the file was edited between
    // parent load and child spawn), and the CORRECT hash for `helper`.
    const helperContent = readFileSync(
      join(workspaceDir, ".pi", "theta", "helper.theta"),
      "utf8",
    );
    const helperHash = hashCallableClosure([{ path: "helper.theta", content: helperContent }]);
    // A real launcher writes the parent-pid carriage beside its markers; the
    // hash carrier is honoured only through the authenticated control-plane
    // read (subagent.md #subagent-control-plane-authentication), so the fixture
    // authenticates the same way.
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "code-review");
    setEnv(
      SUBAGENT_CALLABLE_HASHES_ENV,
      JSON.stringify({ code_review: "sha256:stale-parent-hash", helper: helperHash }),
    );

    const outcome = await runChildLoad(workspaceDir);

    // Fail-closed: the diverged callee is refused (dropped from registration)
    // and its diagnostic surfaces; the matching callee still registers.
    expect(outcome.registered).not.toContain("code-review");
    expect(outcome.registered).toContain("helper");
    expect(outcome.notifications).toContain(HASH_MISMATCH_MSG);
  });

  it("admits both callees when every child-recomputed hash matches", async () => {
    const dir = join(workspaceDir, ".pi", "theta");
    const reviewHash = hashCallableClosure([
      { path: "code-review.theta", content: readFileSync(join(dir, "code-review.theta"), "utf8") },
    ]);
    const helperHash = hashCallableClosure([
      { path: "helper.theta", content: readFileSync(join(dir, "helper.theta"), "utf8") },
    ]);
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "code-review");
    setEnv(
      SUBAGENT_CALLABLE_HASHES_ENV,
      JSON.stringify({ code_review: reviewHash, helper: helperHash }),
    );

    const outcome = await runChildLoad(workspaceDir);

    expect(outcome.registered).toContain("code-review");
    expect(outcome.registered).toContain("helper");
    expect(outcome.notifications).not.toContain(HASH_MISMATCH_MSG);
  });

  it("an UNAUTHENTICATED planted hash map is ignored: no refusal, no verification, both callees register", async () => {
    // The threat the authentication closes (subagent.md
    // #subagent-control-plane-authentication): a `PI_THETA_*` map arriving
    // through the ambient environment — a repository `.env` a host loads —
    // rather than from a real launcher. Without the parent-pid carriage the
    // control plane is dropped: the stale map must neither refuse a callee nor
    // throw a parse failure out of the compose pass. The identical stale map
    // WITH the carriage is the first cell's refusal — together the two cells
    // pin that the pid equality is the difference.
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "code-review");
    setEnv(
      SUBAGENT_CALLABLE_HASHES_ENV,
      JSON.stringify({ code_review: "sha256:stale-parent-hash" }),
    );

    const outcome = await runChildLoad(workspaceDir);

    expect(outcome.registered).toContain("code-review");
    expect(outcome.registered).toContain("helper");
    expect(outcome.notifications).not.toContain(HASH_MISMATCH_MSG);
  });

  it("an unauthenticated MALFORMED hash map cannot throw the compose pass down (the repo-writable load-time crash)", async () => {
    // `readMarshalledCallableHashes` deliberately lets a malformed map's
    // `SyntaxError` escape when the carrier is genuine (a real launcher never
    // writes one). Planted WITHOUT the parent-pid carriage it must be dropped
    // before parsing — an ambient `.env` must not be able to crash every load.
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "code-review");
    setEnv(SUBAGENT_CALLABLE_HASHES_ENV, "{not json");

    const outcome = await runChildLoad(workspaceDir);

    expect(outcome.registered).toContain("code-review");
    expect(outcome.registered).toContain("helper");
    expect(outcome.notifications).not.toContain(HASH_MISMATCH_MSG);
  });
});

// b0330 — an `as`-renamed `.theta` callable draws a spurious
// `theta/runtime/subagent-callable-hash-mismatch` on every launch. The parent
// marshals the closure hash under the PRESENTED name (`entry.presentedName`,
// `production-theta-producer.ts`), but the child's `byName` alignment
// (`refuseDivergedChildCallables` in `production-composition.ts`) keys discovery
// on file-derived names only (`deriveCallableName`: basename minus `.theta`,
// hyphens→underscores). A presented name is no file's basename, so
// `discovery(name)` answers `undefined`, `verifyOne`
// (`subagent-child-hash-verify.ts`) refuses fail-closed, and the pinned
// diagnostic fires on byte-identical sources with the correct hash in hand.
//
// The rename cells write their own caller/callee fixtures into the shared
// workspace `.pi/theta` dir; the `beforeEach` code-review/helper thetas carry no
// marshalled key here (their derived names are absent from the carrier), so they
// register untouched and do not perturb the renamed-callable verification.
describe("b0330 — child verifies an `as`-renamed `.theta` callable by its presented name", () => {
  const RENAMED_HASH_MISMATCH_MSG =
    "subagent callable 'zqx_renamed' content hash mismatch; refusing invocation";
  // `tools: [./zqx-tool.theta as zqx_renamed]` is a first-class `tools:` grammar
  // production — the rename rides the frozen callable-set entry so the callee
  // stays dispatchable child-side. Double-quoted so `${…}` and backticks stay
  // literal `.theta` body text rather than TS interpolation.
  const ZQX_CALLER =
    "---\nmode: subagent\ntools:\n  - ./zqx-tool.theta as zqx_renamed\n---\nlet r = zqx_renamed(\"hi\")\n@`use ${r}`\n";
  const ZQX_TOOL =
    "---\nmode: subagent\nparams:\n  q: string\n---\n@`tool body ${q}`\n";

  function plantRenameFixture(): string {
    const dir = join(workspaceDir, ".pi", "theta");
    writeFileSync(join(dir, "zqx-caller.theta"), ZQX_CALLER, "utf8");
    writeFileSync(join(dir, "zqx-tool.theta"), ZQX_TOOL, "utf8");
    return dir;
  }

  it("admits the renamed callee when the child-recomputed closure hash matches (b0330 match-admits)", async () => {
    const dir = plantRenameFixture();
    // The closure hash never folds the path in (`hashCallableClosure` hashes
    // content only), so the correct on-disk-callee hash the parent marshals for
    // the presented name `zqx_renamed` is byte-identical to the one the child
    // recomputes — a matching hash on unchanged sources MUST admit.
    const correctHash = hashCallableClosure([
      {
        path: join(dir, "zqx-tool.theta"),
        content: readFileSync(join(dir, "zqx-tool.theta"), "utf8"),
      },
    ]);
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "zqx-caller");
    // The marshalled key is the PRESENTED name (`zqx_renamed`), never the file
    // basename (`zqx_tool`) — that key-space is what the child must honour.
    setEnv(
      SUBAGENT_CALLABLE_HASHES_ENV,
      JSON.stringify({ zqx_renamed: correctHash }),
    );

    const outcome = await runChildLoad(workspaceDir);

    // RED on the current tree: `byName` cannot resolve `zqx_renamed`, so the
    // mismatch fires with `observed <child source unavailable>` on identical
    // bytes. Green once the child aligns the presented name to the callee.
    expect(outcome.notifications).not.toContain(RENAMED_HASH_MISMATCH_MSG);
    expect(outcome.registered).toContain("zqx-caller");
    expect(outcome.registered).toContain("zqx-tool");
  });

  it("refuses and drops the renamed callee when the marshalled closure hash is stale (b0330 edit-refuses)", async () => {
    plantRenameFixture();
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "zqx-caller");
    setEnv(
      SUBAGENT_CALLABLE_HASHES_ENV,
      JSON.stringify({ zqx_renamed: "sha256:stale-parent-hash" }),
    );

    const outcome = await runChildLoad(workspaceDir);

    // Post-fix lock. Before the fix the mismatch fires from
    // `<child source unavailable>` (the presented name is no file basename), and
    // with no `byName` hit nothing is dropped — so the drop arm reds today. Once
    // the child resolves the renamed callee, a real byte divergence draws the
    // mismatch AND drops the callee. Under bug 0329 Option A (0.322.0) the marked
    // ROOT is dropped alongside the diverged callee — a mismatch on any
    // marshalled callable refuses the whole invocation — so the caller no longer
    // registers either (its `-p "/zqx-caller"` argv is no longer a command and
    // `markedRootRegistrationRefusal` owes the parent the load_failure envelope).
    expect(outcome.notifications).toContain(RENAMED_HASH_MISMATCH_MSG);
    expect(outcome.registered).not.toContain("zqx-tool");
    expect(outcome.registered).not.toContain("zqx-caller");
  });
});
