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
