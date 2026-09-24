// RFC-0006 / RFC-0012 — host CLI dialects and subagent child argv assembly.

import { delimiter as PATH_DELIMITER } from "node:path";
import { SUBAGENT_LAUNCH_FLAG } from "./subagent-launcher";
import type { SubagentPlacementPresentation } from "./subagent-placement";

// ---------------------------------------------------------------------------
// Argv assembly (#subagent-launch-contract).
// ---------------------------------------------------------------------------

/**
 * The host-CLI dialect the child argv is assembled in. The launch contract is
 * INTENT-level: every field below names an intent ("disable ambient extension
 * discovery", "withhold project-local trust") and carries the flags the target
 * host spells it with. Two hosts run a theta today and they do not share a flag
 * vocabulary, so the contract cannot be one hardcoded flag list:
 *
 *   - Pi accepts `-ne`, `--no-skills`, `--no-prompt-templates`, `--no-themes`,
 *     `--no-context-files`, `--approve` / `--no-approve`.
 *   - Oh-My-Pi shares only `--no-skills` with that list, has NONE of the
 *     other spellings, and REJECTS unknown flags
 *     outright (`Error: unknown flags: …`, exit code 2 before any session
 *     starts) rather than absorbing them into an extension-flag map the way Pi
 *     does. A Pi-spelled argv therefore does not degrade on Oh-My-Pi — it kills
 *     the child, which the parent observes only as an exit-without-envelope.
 *
 * An intent the target host cannot express is an EMPTY flag list, NEVER a
 * substitute drawn from a different control. Oh-My-Pi exposes no
 * prompt-template or theme opt-out and no project-trust flag, so a child there
 * inherits those ambient sources and that default trust posture. The isolation
 * that IS expressible is expressed — Oh-My-Pi's `--no-rules` is an
 * ambient-instruction source Pi has no counterpart for, and belongs to the same
 * intent as `--no-context-files`.
 *
 * On the project-trust pair specifically, resist the obvious-looking mapping.
 * Pi's `--approve` / `--no-approve` is PROJECT-FILE trust, not tool approval:
 * Pi's own argv parser sets `projectTrustOverride` from them, and its help text
 * reads "Trust project-local files for this run" / "Ignore project-local files
 * for this run". Oh-My-Pi's superficially similar `--auto-approve` and
 * `--approval-mode` govern TOOL-CALL approval instead — a different security
 * control with a different blast radius. Mapping the pair onto them would both
 * over-grant (`--auto-approve` sets `tools.approvalMode: yolo`, auto-approving
 * every write and exec, far broader than trusting project-local files) and
 * wrongly restrict (`--approval-mode always-ask` prompts for write/exec, and a
 * headless child has no UI to prompt, so those calls are DENIED — a restriction
 * Pi never imposed). Two unrelated controls that happen to share the word
 * "approve" stay unmapped.
 */
export interface HostCliDialect {
  /** Disable ambient extension discovery (the extension pin's first half). */
  readonly noExtensionDiscovery: readonly string[];
  /** Isolate the child from ambient non-theta instruction sources. */
  readonly ambientIsolation: readonly string[];
  /** Trust project-local files in the child (project-local trust inferred). */
  readonly projectTrust: readonly string[];
  /** Withhold project-local trust from the child (least privilege). */
  readonly noProjectTrust: readonly string[];
  /**
   * Whether this host tolerates a `--tools` allowlist entry unknown at
   * startup — i.e. one for a HOST tool the child's own extension registers
   * mid-session (bug 0488: the synthesised `__theta_respond_<slug>` respond
   * tool). `true` on Pi (cell 4, docs/bugs/0488-…: pi 0.86.1 does not exit-2
   * on an unrecognised allowlist name at startup). `false` on Oh-My-Pi (bug
   * 0218 / subagent.md:130: that host validates every `--tools` entry
   * against its startup registry and exits 2 on one it does not recognise —
   * a mid-session-only name would kill the child before it ever registers
   * the tool). The emit site in `assembleSubagentArgv` reads this to decide
   * whether a launch's respond-tool names ride the allowlist at all.
   */
  readonly toleratesUnregisteredToolNames: boolean;
}

/** The authored host dialect — Pi (`@earendil-works/pi-coding-agent`). */
export const PI_CLI_DIALECT: HostCliDialect = Object.freeze({
  noExtensionDiscovery: Object.freeze(["-ne"]),
  ambientIsolation: Object.freeze([
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
  ]),
  projectTrust: Object.freeze(["--approve"]),
  noProjectTrust: Object.freeze(["--no-approve"]),
  toleratesUnregisteredToolNames: true,
});

/**
 * The Oh-My-Pi host dialect (`@oh-my-pi/pi-coding-agent`, the `omp` binary).
 * Both project-trust arms are EMPTY: the host has no project-trust flag, and the
 * nearest-looking flags govern a different control (see `HostCliDialect`). A
 * child there therefore keeps the host's own default posture toward
 * project-local files, in BOTH trust directions — a documented limitation of
 * running on this host, not a silent substitution.
 */
export const OMP_CLI_DIALECT: HostCliDialect = Object.freeze({
  noExtensionDiscovery: Object.freeze(["--no-extensions"]),
  ambientIsolation: Object.freeze(["--no-skills", "--no-rules"]),
  projectTrust: Object.freeze([]),
  noProjectTrust: Object.freeze([]),
  toleratesUnregisteredToolNames: false,
});

/** The host `CONFIG_DIR_NAME` value that identifies an Oh-My-Pi host. */
const OMP_CONFIG_DIR_NAME = ".omp";

/*
 * There is deliberately NO env override for the dialect.
 *
 * An earlier revision honoured a `PI_THETA_HOST_DIALECT` variable as an operator
 * escape hatch. It was removed because it could only ever weaken isolation.
 * Forcing the Pi dialect on Oh-My-Pi kills every child (that host rejects unknown
 * flags), so the "escape" is a denial of service; forcing the Oh-My-Pi dialect on
 * Pi is worse, because Pi ABSORBS unrecognised flags instead of rejecting them, so
 * `--no-extensions` and `--no-rules` become no-ops and the child silently loses
 * every ambient-isolation flag it was supposed to carry — project context files
 * (AGENTS.md / CLAUDE.md from the repository) then enter its prompt, which is
 * exactly the injection channel the isolation set closes.
 *
 * The hatch also bought very little: detection reads the host SDK's own
 * `CONFIG_DIR_NAME` off the LOADED module, so it cannot be fooled by renaming or
 * wrapping a binary, and a wrong answer on Oh-My-Pi fails closed and loudly. And
 * on a host that loads `<cwd>/.env` into the environment, an env-readable switch
 * is repository-writable, which turns an operator hatch into an attacker lever.
 */
/**
 * Resolve the dialect from the host's own `CONFIG_DIR_NAME` constant — read off
 * the LOADED SDK module (see `ExecutableHost.configDirName`), so it names the
 * host actually serving this process. `".omp"` selects the Oh-My-Pi dialect;
 * every other value, and an absent one, selects the authored Pi dialect, so an
 * unrecognised host behaves exactly as it did before this seam existed.
 *
 * The host constant is the ONLY input: see the note above on why there is no env
 * override to weaken it.
 */
export function resolveHostCliDialect(configDirName: string | undefined): HostCliDialect {
  return configDirName === OMP_CONFIG_DIR_NAME ? OMP_CLI_DIALECT : PI_CLI_DIALECT;
}

/** The inputs the subagent-drive argv assembly consumes (RFC-0006 json-mode child). */
export interface SubagentArgvInput {
  /**
   * Optional extension-identity pin (#subagent-extension-pin): an extension
   * entry path → `<dialect.noExtensionDiscovery> -e <path>` PREPENDED to the
   * argv, disabling ambient extension discovery in the child. `undefined` (the
   * production default) leaves discovery ambient — both hosts auto-discover a
   * theta install from its `package.json` extension-entry declaration. Derived
   * from `SUBAGENT_EXTENSION_PIN_ENV` by `launchSubagentChild` when not supplied
   * explicitly.
   */
  readonly extensionPinDir?: string;
  /** The callee slug → `-p "/<slug>"` (the child invokes the callee as its root slash command). */
  readonly slug: string;
  /**
   * The theta discovery roots → ONE `--theta` flag, all roots joined with
   * `path.delimiter` (omitted when empty), so the child re-discovers the
   * callee. Never one flag per root — host pi resolves a repeated extension
   * string flag to its last occurrence, silently dropping every earlier root
   * in the child (bug 0008).
   */
  readonly thetaDirs: readonly string[];
  /** Resolved-and-interpolated frontmatter `system:` → `--system-prompt`. */
  readonly systemPrompt: string;
  /**
   * The callable set's HOST-TOOL names → part of `--tools <name1,name2,…>`
   * (defence-in-depth, PIC-58). Host-registry names ONLY: `--tools` is a HOST
   * tool allowlist, so a `.theta` callable's presented name has no business in
   * it — that half of the callable set is theta-side, resolved child-side against
   * the child's own theta registry, and carried by the presented-name + closure-
   * hash env carrier instead. One host validates this list against its registry
   * and exits 2 on an unknown name (bug 0218), so a theta-side name here is not
   * harmless noise: it kills the child before it starts. The emitted `--tools`
   * csv (bug 0488) is this set UNIONED with `respondToolNames` below, on a
   * dialect that tolerates the union's mid-session-only entries.
   */
  readonly hostTools: readonly string[];
  /**
   * The synthesised `__theta_respond_<slug>` tool names (bug 0488) the body
   * THIS launch drives will register mid-session for its own typed queries —
   * deduped and sorted by the spawn site
   * (`collectLaunchRespondNames`, `production-theta-producer.ts`). These are
   * HOST-registry names exactly like `hostTools`: the child's own pi-theta
   * instance calls `pi.registerTool()` for each during the run, not names the
   * host resolves at startup. `--tools` on pi ≥ 0.86 is a strict allowlist for
   * the WHOLE session (CHANGELOG 0.86.0), so a name absent here is never
   * model-callable even though it is registered mid-session — the launch
   * must carry it up front or the registration is silently suppressed (bug
   * 0488's symptom). The emit site unions this with `hostTools`, gated by
   * `HostCliDialect.toleratesUnregisteredToolNames` (bug 0218: a dialect that
   * validates the allowlist at startup would exit 2 on a name it cannot
   * resolve yet).
   */
  readonly respondToolNames: readonly string[];
  /**
   * `true` when the callable set holds NO host tool → `--no-tools` (empty ≠
   * omission: omission would re-enable the host's default built-ins). True for a
   * `tools: []` theta AND for one whose callable set is all `.theta` callables —
   * the child's host session needs no host tool to run those, because the theta
   * runtime spawns their own children. This arm flips to `--tools
   * <respond-only>` (bug 0488) when the tolerant dialect's respond names are
   * non-empty — an empty host set plus a live respond name is not "no tools",
   * it is "exactly the respond tool".
   */
  readonly noHostTools: boolean;
  /** Resolved model provider → `--provider <p>`. */
  readonly provider: string;
  /** Resolved model id → `--model <id>`. */
  readonly model: string;
  /**
   * Project-local trust inference (`inferChildTrust`) → the dialect's
   * `projectTrust` flags iff true, else its `noProjectTrust` flags. Named for
   * the control it governs — trusting the child with PROJECT-LOCAL FILES — and
   * deliberately not "approve": Pi spells this intent `--approve`/`--no-approve`
   * while Oh-My-Pi uses those words for tool-call approval instead, and the
   * shared word is what invites conflating the two.
   */
  readonly projectTrust: boolean;
  /**
   * RFC-0012 §7: the presentation the argv is assembled for. `"headless"`
   * (the default, and the only form under `pipe`) is the `--mode json -p
   * "/<slug>" (--session <child-log> | --no-session)` print form; `"visible"`
   * is the interactive TUI form
   * `--name <label> (--session <child-log> | --no-session | <neither>) "/<slug>"` — the slug as a bare
   * trailing positional (the pin's `parseArgs` has no `--` separator arm).
   */
  readonly presentation?: SubagentPlacementPresentation;
  /** The session display name for the visible form (`--name`). Required when `presentation` is `"visible"`. */
  readonly label?: string;
  /**
   * RFC-0012 §7: omit `--no-session` so the operator can `/resume` the visible
   * child afterwards (the backend's `persistSession` capability). Superseded
   * by `sessionPath` when present (bug 0489); ignored under the headless
   * form, which carries `--session <path>` or `--no-session`.
   */
  readonly persistSession?: boolean;
  /**
   * Operator session-log policy: an explicit child session file path →
   * `--session <path>` on BOTH presentations, superseding `persistSession`
   * and `--no-session`. Derived by the composition root (parent-session-
   * nested: `<parent-dir>/<parent-base>/<ts>_theta-<label>.jsonl`, or
   * `<parent>.d/…` for a suffix-less parent; the
   * label sanitised and prefix-capped with its `#…` suffix preserved);
   * absent → the legacy `--no-session` forms (parent itself sessionless, or
   * a harness that never wired the seam). Bug 0489: no opt-out — if a
   * model is used, its session log is persisted.
   */
  readonly sessionPath?: string;
  /**
   * RFC-0012 §2: the parent-private launch file path → `--theta-launch <path>`
   * (the `--theta` flag's sibling). Present on every non-`pipe` launch, absent
   * under `pipe`.
   */
  readonly launchFile?: string;
}

/**
 * RFC-0006 (subagent.md #subagent-launch-contract). Assemble the json-mode child
 * argv (after the executable + entry-script args). The compliant assembly is:
 *   [<no-extension-discovery> -e <pin>] [--theta <dirs>]
 *   --mode json -p "/<slug>" (--session <child-log> | --no-session) --system-prompt <sp>
 *   (--tools <csv> | --no-tools) --provider <p> --model <id>
 *   <ambient-isolation> (<approve> | <no-approve>)
 * The angle-bracketed groups come from `dialect` — see `HostCliDialect` for why
 * the launch contract is intent-level rather than a fixed flag list.
 * `--theta` is ONE flag joining every discovery root with `path.delimiter`
 * (the documented discovery CLI-source convention), omitted for an empty root
 * set — never repeated per root (bug 0008: the host collapses a repeated
 * extension string flag to its last occurrence).
 * The child runs the WHOLE callee: interpreter, extension discovery, and its own
 * host agent loop. `--tools` is defence-in-depth only (the child theta enforces
 * its own callable set) and carries the callable set's HOST-TOOL names only — a
 * `.theta` callable is theta-side and rides the closure-hash env carrier instead
 * (bug 0218). Bug 0488: the `--tools` csv is HOST-TOOL names UNIONED with the
 * driven body's synthesised respond-tool names, on a dialect that tolerates a
 * mid-session-only allowlist entry (`HostCliDialect.toleratesUnregisteredToolNames`;
 * gated OFF on Oh-My-Pi, bug 0218). A callable set with no host tool and no
 * respond name maps to `--no-tools` (never re-enables host defaults by
 * omission); a callable set with no host tool but a live respond name maps to
 * `--tools <respond-only>` instead. Params ride the marshalled channel
 * (PIC-60), the result rides the stdout envelope (PIC-59) — neither is on argv.
 */
export function assembleSubagentArgv(
  input: SubagentArgvInput,
  dialect: HostCliDialect,
): string[] {
  const argv: string[] = [];
  // #subagent-extension-pin (opt-in; bug 0002 defect 2): pin the child to an
  // explicit extension entry — the dialect's no-discovery flag disables ambient
  // discovery, `-e <path>` loads exactly the named build — so a test harness's
  // child binds to the same extension under test as its parent. Absent
  // (production): ambient discovery.
  if (input.extensionPinDir !== undefined) {
    argv.push(...dialect.noExtensionDiscovery, "-e", input.extensionPinDir);
  }
  // ONE `--theta` flag carrying every discovery root joined with
  // `path.delimiter`, so the child re-discovers the callee `.theta` and its
  // `.thetalib` imports (the child owns the interpreter under RFC 0006). Never
  // one flag per root (bug 0008): host pi's argv parser stores extension flags
  // in an unknownFlags Map (dist/cli/args.js) — a repeated string flag resolves
  // to its LAST occurrence, and `pi.getFlag` is `boolean | string | undefined`
  // — so repeated `--theta` silently drops every root but the last in the
  // child. The joined single flag is the documented discovery CLI-source
  // convention (discovery-sources.md) and the form the child-side
  // `readThetaFlagPaths` already splits. An empty root set OMITS the flag —
  // omission is the documented no-CLI-source form, while `--theta ""` is an
  // undocumented argv shape that would merely rely on the reader dropping
  // empty split components.
  if (input.thetaDirs.length > 0) {
    argv.push("--theta", input.thetaDirs.join(PATH_DELIMITER));
  }
  // RFC-0012 §2: the launch file's path travels on argv as a registered flag
  // (`--theta-launch`, read child-side with `pi.getFlag`), because a child a
  // multiplexer spawns is not this process's child and may not inherit its
  // environment — argv is the one channel that reliably crosses.
  if (input.launchFile !== undefined) {
    argv.push(`--${SUBAGENT_LAUNCH_FLAG}`, input.launchFile);
  }
  // The system prompt is emitted so that it is read as TEXT, never as a path.
  //
  // Both hosts path-coerce this argument: one calls `existsSync` on the value and
  // reads the file when it exists, the other opens any newline-free value with
  // `Bun.file(value).text()` and falls back to the literal only on a read failure.
  // The value here is the theta's frontmatter `system:` text AFTER `${param}`
  // interpolation, and on the binder path those params are filled from model
  // output — so the coercion would let a value that happens to name a readable
  // file replace the intended prompt with that file's contents, and the child's
  // system prompt is not a channel where surprise content belongs.
  //
  // A leading newline defeats both coercions at once: the newline-bearing value is
  // returned as a literal by the one host, and no existing path can contain a
  // newline, so the other's existence test misses. A leading blank line is
  // semantically inert in a system prompt.
  //
  // The EMPTY prompt is left exactly as-is. Both hosts treat a falsy value as "no
  // CLI system prompt" and fall back to their built-in default, which is what a
  // theta declaring no `system:` wants; prefixing would make it truthy and install
  // a one-blank-line prompt instead, silently discarding that default.
  if (input.presentation === "visible") {
    // RFC-0012 §7 visible form: the interactive TUI with the slash command as
    // the initial message (`InteractiveMode.run` → `AgentSession.prompt` →
    // `_tryExecuteExtensionCommand`, verified at the pin). `--name` titles the
    // session; below, a bug-0489 derived path wins outright, else
    // `--no-session` stays unless the backend asked to persist the
    // session for a later `/resume`. The slug is pushed LAST as a bare
    // positional — see `assembleVisibleTail` for why it must trail.
    argv.push("--name", input.label ?? input.slug);
    // Session-log policy ladder: an explicit derived path wins; else the
    // backend's `persistSession` omits the flag (child picks its default
    // path); else the RFC-0012 §7 baseline `--no-session`.
    if (input.sessionPath !== undefined) {
      argv.push("--session", input.sessionPath);
    } else if (input.persistSession !== true) {
      argv.push("--no-session");
    }
    argv.push("--system-prompt", input.systemPrompt === "" ? "" : `\n${input.systemPrompt}`);
  } else {
    argv.push("--mode", "json", "-p", `/${input.slug}`);
    // Headless form: `--session <derived>` when the operator session-log
    // policy supplies a path; the RFC-0012 §7 baseline `--no-session`
    // otherwise (parent sessionless, or seam not wired — bug 0489 has no
    // opt-out).
    if (input.sessionPath !== undefined) {
      argv.push("--session", input.sessionPath);
    } else {
      argv.push("--no-session");
    }
    argv.push("--system-prompt", input.systemPrompt === "" ? "" : `\n${input.systemPrompt}`);
  }
  // `--no-tools` when the callable set holds no HOST tool AND no respond name
  // is carried (empty ≠ omission — omission would re-enable the host's default
  // built-ins); otherwise the comma-joined union of the host-registry
  // allowlist and the driven body's synthesised respond-tool names (bug 0488),
  // deduped so a respond name that collides with a host-tool name is not
  // repeated. A `.theta` callable never appears here: it names nothing in the
  // host's registry, and one host rejects such a name outright (bug 0218) —
  // the same reason the respond names are gated to dialects that tolerate an
  // allowlist entry unknown at startup.
  const respondNames = dialect.toleratesUnregisteredToolNames ? input.respondToolNames : [];
  if (input.noHostTools && respondNames.length === 0) {
    argv.push("--no-tools");
  } else {
    argv.push("--tools", dedupePreservingFirst([...input.hostTools, ...respondNames]).join(","));
  }
  argv.push("--provider", input.provider, "--model", input.model);
  argv.push(...dialect.ambientIsolation);
  argv.push(...(input.projectTrust ? dialect.projectTrust : dialect.noProjectTrust));
  if (input.presentation === "visible") {
    argv.push(...assembleVisibleTail(input.slug));
  }
  return argv;
}

/**
 * The visible form's trailing positional: the slash command the interactive
 * child dispatches as its initial message. It MUST be the LAST argv element:
 * the host's `parseArgs` reads a positional that follows a value-less unknown
 * flag as THAT flag's value, and the ambient-isolation / trust groups the
 * argv ends with are exactly such flags on a host that does not know them
 * (Pi absorbs unrecognised flags into its extension-flag map). Trailing after
 * `--system-prompt <text>` … `--no-approve` keeps every known flag's value
 * pairing intact and lands the slug in `parsed.messages`. No `--` separator:
 * the pin's parser has no arm for it (RFC 0012 §7).
 */
function assembleVisibleTail(slug: string): readonly string[] {
  return [`/${slug}`];
}

/**
 * Dedup `names`, first occurrence wins, order preserved (bug 0488): the
 * `--tools` csv unions `hostTools` with the driven body's respond names, and
 * either side can repeat a name — a respond name equal to an already-listed
 * host tool, or a caller passing a duplicate respond name — without the
 * allowlist gaining a repeated entry.
 */
function dedupePreservingFirst(names: readonly string[]): string[] {
  return [...new Set(names)];
}
