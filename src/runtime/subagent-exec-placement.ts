// RFC-0012 §4 — the `exec` placement backend: an operator-supplied command
// template that puts the assembled child somewhere. The generic adapter for a
// multiplexer that has a CLI but no JavaScript API (tmux, Zellij, WezTerm,
// cmux): `spawn` is an argv template whose `{argv}` element expands IN PLACE to
// the child's executable followed by every argv element — never joined into one
// string, never through a shell — and whose first stdout line is the handle
// `kill` later receives as `{handle}`.
//
// Trust (§4 *Trust*): the template is honoured from the GLOBAL settings file
// only; that rule lives in the settings reader (`subagent-placement-selection.ts`
// / `discovery/settings.ts`), not here. This module is pure over an injected
// command runner (`ExecCommandRunner`) and the parent's environment view.

import { SUBAGENT_DISPOSE_BUDGET_MS } from "./subagent-isolation";
import type { Clock, TimerHandle } from "../seams/clock";
import {
  EXEC_PLACEMENT_NAME,
  type PlacedChild,
  type SubagentPlacementBackend,
  type SubagentPlacementRequest,
} from "./subagent-placement";

/** The whole-element placeholder that expands to `execPath` + every child argv element. */
export const EXEC_ARGV_PLACEHOLDER = "{argv}";
/** Substring placeholders substituted inside any element. */
export const EXEC_CWD_PLACEHOLDER = "{cwd}";
export const EXEC_LABEL_PLACEHOLDER = "{label}";
export const EXEC_HANDLE_PLACEHOLDER = "{handle}";

/**
 * How long the launcher command may run before `place()` gives up on it and
 * the launch is a spawn failure — a launcher that never returns must not hold
 * the invocation open forever. The PIC-65 dispose budget, reused rather than a
 * second number.
 */
export const EXEC_COMMAND_TIMEOUT_MS = SUBAGENT_DISPOSE_BUDGET_MS;

/** The validated `theta.subagentPlacementExec` value. */
export interface ExecPlacementTemplate {
  /** `auto` considers `exec` only while this variable is set (explicit `exec` ignores it). */
  readonly when?: { readonly env: string };
  /** The launcher argv; exactly one element is `{argv}`; `{cwd}` / `{label}` substitute anywhere. */
  readonly spawn: readonly string[];
  /** The kill argv; `{handle}` substitutes anywhere. Absent ⇒ `kill()` is a no-op. */
  readonly kill?: readonly string[];
  /**
   * `"inherit"` asserts the launcher passes the composed child environment
   * through to the child (tmux `-e`, a server inheriting the client env);
   * `"none"` (the default) says it does not, which engages the credential
   * guard (§6, D6).
   */
  readonly env: "inherit" | "none";
}

/** The structural verdict `parseExecPlacementTemplate` returns. */
export type ExecTemplateParse =
  | { readonly ok: true; readonly template: ExecPlacementTemplate }
  | { readonly ok: false; readonly reason: string };

const TEMPLATE_KEYS: ReadonlySet<string> = new Set(["when", "spawn", "kill", "env"]);

/**
 * Validate a `subagentPlacementExec` settings value. Closed key set (a typo
 * must not pass silently as "no kill template"); `spawn` is a non-empty string
 * array carrying exactly one whole-element `{argv}` — an element that merely
 * CONTAINS `{argv}` would join the child argv into one string, which is the
 * shell-quoting hazard the argv form exists to avoid, so it is refused.
 */
export function parseExecPlacementTemplate(value: unknown): ExecTemplateParse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "must be an object with a `spawn` argv template" };
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!TEMPLATE_KEYS.has(key)) {
      return { ok: false, reason: `unknown key '${key}' (allowed: when, spawn, kill, env)` };
    }
  }
  const spawn = record["spawn"];
  if (!isStringArray(spawn) || spawn.length === 0) {
    return { ok: false, reason: "`spawn` must be a non-empty array of strings" };
  }
  const argvSlots = spawn.filter((element) => element === EXEC_ARGV_PLACEHOLDER).length;
  if (argvSlots !== 1) {
    return { ok: false, reason: `\`spawn\` must contain exactly one \`${EXEC_ARGV_PLACEHOLDER}\` element` };
  }
  if (spawn.some((element) => element !== EXEC_ARGV_PLACEHOLDER && element.includes(EXEC_ARGV_PLACEHOLDER))) {
    return {
      ok: false,
      reason: `\`${EXEC_ARGV_PLACEHOLDER}\` must be a whole element (the child argv is never joined into one string)`,
    };
  }
  let kill: readonly string[] | undefined;
  if (record["kill"] !== undefined) {
    if (!isStringArray(record["kill"]) || record["kill"].length === 0) {
      return { ok: false, reason: "`kill` must be a non-empty array of strings" };
    }
    kill = record["kill"];
  }
  let when: { readonly env: string } | undefined;
  if (record["when"] !== undefined) {
    const raw = record["when"];
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { ok: false, reason: "`when` must be an object of the form { \"env\": \"<VAR>\" }" };
    }
    const env = (raw as Record<string, unknown>)["env"];
    const keys = Object.keys(raw as Record<string, unknown>);
    if (typeof env !== "string" || env.length === 0 || keys.length !== 1) {
      return { ok: false, reason: "`when` must be an object of the form { \"env\": \"<VAR>\" }" };
    }
    when = { env };
  }
  let env: "inherit" | "none" = "none";
  if (record["env"] !== undefined) {
    if (record["env"] !== "inherit" && record["env"] !== "none") {
      return { ok: false, reason: "`env` must be \"inherit\" or \"none\"" };
    }
    env = record["env"];
  }
  return {
    ok: true,
    template: {
      ...(when !== undefined ? { when } : {}),
      spawn,
      ...(kill !== undefined ? { kill } : {}),
      env,
    },
  };
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((element) => typeof element === "string");
}

/** The values one expansion substitutes. */
export interface ExecTemplateValues {
  readonly cwd: string;
  readonly label: string;
  /** `execPath` followed by every child argv element; expands the `{argv}` element in place. */
  readonly argv?: readonly string[];
  readonly handle?: string;
}

/**
 * Expand an argv template: a whole `{argv}` element becomes `values.argv`'s
 * elements (spliced, never joined); `{cwd}`, `{label}` and `{handle}` are
 * substituted as substrings of any element. A placeholder with no value
 * supplied is left as written.
 */
export function expandExecTemplate(template: readonly string[], values: ExecTemplateValues): string[] {
  const out: string[] = [];
  for (const element of template) {
    if (element === EXEC_ARGV_PLACEHOLDER) {
      if (values.argv !== undefined) {
        out.push(...values.argv);
      } else {
        out.push(element);
      }
      continue;
    }
    let expanded = element.split(EXEC_CWD_PLACEHOLDER).join(values.cwd);
    expanded = expanded.split(EXEC_LABEL_PLACEHOLDER).join(values.label);
    if (values.handle !== undefined) {
      expanded = expanded.split(EXEC_HANDLE_PLACEHOLDER).join(values.handle);
    }
    out.push(expanded);
  }
  return out;
}

/** What one launcher / kill command run produced. */
export interface ExecCommandResult {
  readonly code: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * The command runner seam (`node:child_process.spawn` with `shell: false` in
 * production; a fake in tests). `signal` aborts a run the backend has given up
 * on; the runner kills the command and resolves or rejects — it never leaves
 * the process behind.
 */
export interface ExecCommandRunner {
  run(
    argv: readonly string[],
    options: {
      readonly cwd: string;
      readonly env: Readonly<Record<string, string | undefined>>;
      readonly signal: AbortSignal;
    },
  ): Promise<ExecCommandResult>;
}

/** Collaborators the `exec` backend consumes. */
export interface ExecPlacementDeps {
  readonly runner: ExecCommandRunner;
  /** The parent's environment view `when` is judged against (never `process.env` directly). */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly clock: Clock;
  /** Launcher-command bound; defaults to `EXEC_COMMAND_TIMEOUT_MS`. */
  readonly commandTimeoutMs?: number;
}

/**
 * Build the `exec` backend over a validated template. `detect()` is the
 * `when` gate (absent `when` ⇒ always detected); `place()` runs the expanded
 * `spawn` template with the child's `cwd` and composed env, reads the handle
 * off the first stdout line, and refuses (a throw the launcher maps to
 * `theta/runtime/subagent-spawn-failed`) on a non-zero exit, an empty handle,
 * a runner rejection, or the command bound elapsing. Capabilities:
 * `observesExit: false` (settlement comes from the result channel),
 * `inheritsEnv` per the template's `env`, `visible: true`.
 */
export function createExecPlacementBackend(
  template: ExecPlacementTemplate,
  deps: ExecPlacementDeps,
): SubagentPlacementBackend {
  const timeoutMs = deps.commandTimeoutMs ?? EXEC_COMMAND_TIMEOUT_MS;

  const runBounded = async (
    argv: readonly string[],
    cwd: string,
    env: Readonly<Record<string, string | undefined>>,
  ): Promise<ExecCommandResult> => {
    const abort = new AbortController();
    let timer: TimerHandle | undefined;
    const timedOut = new Promise<never>((_resolve, reject) => {
      timer = deps.clock.setTimeout(() => {
        // Reject BEFORE aborting so the bound's own message wins the race over
        // whatever the runner rejects with when it sees the abort.
        reject(new Error(`exec placement command did not return within ${timeoutMs}ms: ${argv[0] ?? ""}`));
        abort.abort();
      }, timeoutMs);
    });
    try {
      return await Promise.race([deps.runner.run(argv, { cwd, env, signal: abort.signal }), timedOut]); // allow: RFC-0012 §4 — bounded launcher run, pi-integration-contract/subagent.md
    } finally {
      if (timer !== undefined) {
        deps.clock.clearTimeout(timer);
      }
    }
  };

  return {
    name: EXEC_PLACEMENT_NAME,
    // Selection orders the built-ins positionally (registered backends, then
    // `exec`, then `pipe` — §6); the field is not load-bearing for them.
    priority: Number.NEGATIVE_INFINITY,
    capabilities: { visible: true, inheritsEnv: template.env === "inherit" },
    detect: (): boolean => {
      if (template.when === undefined) {
        return true;
      }
      const value = deps.env[template.when.env];
      return value !== undefined && value.length > 0;
    },
    place: async (request: SubagentPlacementRequest): Promise<PlacedChild> => {
      const argv = expandExecTemplate(template.spawn, {
        cwd: request.cwd,
        label: request.label,
        argv: [request.execPath, ...request.args],
      });
      const result = await runBounded(argv, request.cwd, request.env);
      if (result.code !== 0 || result.signal !== null) {
        const detail = result.stderr.trim().split("\n")[0] ?? "";
        throw new Error(
          `exec placement command exited ${result.signal ?? result.code}: ${argv[0] ?? ""}${detail.length > 0 ? ` — ${detail}` : ""}`,
        );
      }
      const handle = (result.stdout.split("\n")[0] ?? "").trim();
      if (handle.length === 0) {
        throw new Error(`exec placement command printed no handle on its first stdout line: ${argv[0] ?? ""}`);
      }
      return {
        handle,
        capabilities: {
          observesExit: false,
          inheritsEnv: template.env === "inherit",
          visible: true,
        },
        onExit: (): void => {},
        kill: (): void => {
          if (template.kill === undefined) {
            return;
          }
          const killArgv = expandExecTemplate(template.kill, {
            cwd: request.cwd,
            label: request.label,
            handle,
          });
          // Advisory (PIC-65): a kill-command failure is not a drive outcome
          // and must never surface as an unhandled rejection.
          void runBounded(killArgv, request.cwd, request.env).catch(() => {});
        },
      };
    },
  };
}
