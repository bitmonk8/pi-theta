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
});
