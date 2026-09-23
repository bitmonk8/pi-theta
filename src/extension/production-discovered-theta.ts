// Discovered-`.theta` parse + pi-owned-command / CLI-`--theta`-flag reads for
// the production composition root (production-composition.ts).
//
// Split out of production-composition.ts as PTQ-0322's Seam 0 (the leaf of
// that file's nine-concern breakdown): these six members were file-private
// there (0 external importers) and take every collaborator they need (`pi`,
// `fs`, `theta`, `deps`) as a parameter, so this module imports NOTHING from
// production-composition.ts; production-composition.ts imports them back.
// `buildSystemNoteDeps`, the remaining member of the same source concern,
// stayed in the host: it reads `makeDeliveryFailedEmit` there, and moving it
// would reopen the host<->module cycle this seam exists to avoid.
//
// Spec: pi-integration-contract/extension-bootstrap-and-per-theta.md,
// pi-integration-contract/registration-steps.md (PIC-39 / PIC-69's pi-owned
// collision-set read), discovery.md (the CLI `--theta` discovery source
// `readThetaFlagPaths` parses).

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { delimiter as PATH_DELIMITER, win32 as pathWin32 } from "node:path";
import type { Diagnostic } from "../diagnostics/diagnostic";
import type { DiscoveredTheta, PiOwnedCommand } from "../discovery/discovery-walk";
import type { ParsedFrontmatter } from "../parser/frontmatter";
import type { ThetaDocument } from "../parser/theta-document";
import type { FileSystem } from "../seams/file-system";
import { parseViaPassCache, type PassParseDeps } from "./pass-parse-cache";
import { checkSubagentFnStaticResolution } from "./subagent-fn-static-checks";
import type { ThetaCompositionInput } from "./theta-composition-producer";

/**
 * Whether any aggregated diagnostic is an error-severity load / parse diagnostic
 * that must block registration (the frontmatter value-validations, the `params:`
 * named-type / ordering / default-literal checks, and the `system:` checks all
 * surface here). Warnings never block registration.
 */
export function hasLoadParseError(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" &&
      (diagnostic.code.startsWith("theta/load/") ||
        diagnostic.code.startsWith("theta/parse/")),
  );
}

/**
 * Rejection-to-`undefined` probe read of a `.theta` file's bytes — the house
 * idiom every discovered-theta / callee read uses (never a broad `catch`):
 * an unreadable path yields `undefined`, and the caller decides what an
 * unreadable file means at its site.
 */
export async function readThetaBytes(
  fs: FileSystem,
  path: string,
): Promise<Uint8Array | undefined> {
  return fs.readBytes(path).then(
    (value) => value,
    () => undefined,
  );
}

/**
 * The shared load/parse gate: a parsed `.theta` is usable iff its frontmatter
 * parsed AND no error-severity load/parse diagnostic surfaced
 * ({@link hasLoadParseError}). Narrows `frontmatter` to non-null on the
 * passing arm; a failing caller decides its own failure payload (drop
 * diagnostics, mark a grandchild failed, report `unparseable`, …).
 */
export function passesLoadParseGate(
  document: ThetaDocument,
): document is ThetaDocument & { readonly frontmatter: ParsedFrontmatter } {
  return document.frontmatter !== null && !hasLoadParseError(document.diagnostics);
}

/** The `.theta` basename (minus extension) of a path, for the callee slash name. */
export function thetaBasename(path: string): string {
  return pathWin32.basename(path, ".theta");
}

/**
 * The outcome of parsing one discovered `.theta`: either a runnable composition
 * input together with the document's surviving diagnostics, or a drop carrying
 * the load/parse diagnostics that caused the drop, so the caller can surface
 * BOTH outcomes' batches (FM-3 / DIAG-1). The registering arm's `diagnostics`
 * are warning-severity by construction — an error-severity load/parse
 * diagnostic takes the dropped arm — and must be forwarded, not discarded: a
 * warning alone never un-registers a theta, so this arm is the ONLY route by
 * which a registering theta's parse/frontmatter warnings reach a sink
 * (bug 0013 drop site 3).
 */
export type ParsedDiscoveredTheta =
  | {
      readonly fixture: ThetaCompositionInput;
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly dropped: readonly Diagnostic[] };

/** Read + parse one discovered `.theta` into its `V19a` frontmatter + body AST. */
export async function parseDiscoveredTheta(
  fs: FileSystem,
  theta: DiscoveredTheta,
  deps: PassParseDeps,
): Promise<ParsedDiscoveredTheta> {
  const bytes = await readThetaBytes(fs, theta.path);
  if (bytes === undefined) {
    return { dropped: [] };
  }
  // Bug 0264: this is the discovery parse; when a `tools:` callee walk (or an
  // importer) reaches the SAME file first this pass, the cache returns that
  // parse instead of re-triggering `lexTheta`'s emit.
  const document = parseViaPassCache({ path: theta.path, bytes }, deps);
  if (!passesLoadParseGate(document)) {
    // A well-formed `.theta` carries `mode:` frontmatter and produces no
    // error-severity load/parse diagnostic; a frontmatter-less file cannot be
    // composed into a runnable fixture, and a theta that produced an
    // error-severity `theta/load/*` / `theta/parse/*` diagnostic (an invalid
    // frontmatter value, an unresolved param named type, a `system:`
    // interpolation error, …) must not register (warnings still register).
    //
    // FM-3: return the load-phase diagnostics so the caller emits them. DIAG-1
    // requires every author-visible drop to carry its registry code/message;
    // previously these were computed here and silently discarded, so a `mode:`
    // typo made the command vanish with no feedback. (The `tools:`-resolution
    // diagnostics are emitted separately by `resolveThetaToolsAtLoad` and are
    // not part of `document.diagnostics`, so this does not double-emit them.)
    //
    // RFC 0001 FN-6: when the error-severity diagnostic falls inside a
    // `subagent fn`'s inline body, ADD the `theta/load/callee-has-errors`
    // framing that names the FUNCTION (a broken `subagent fn` body is a
    // callee-with-errors, just an inline one). Only meaningful once frontmatter
    // parsed (a frontmatter-less file has no walkable top-level `subagent fn`).
    const subagentFnFraming =
      document.frontmatter === null
        ? []
        : checkSubagentFnStaticResolution({
            body: document.body,
            file: theta.path,
            parseDiagnostics: document.diagnostics,
          });
    // Bug 0255: `lexTheta` already delivered `document.deliveredDiagnostics`
    // through the V7d seam (`lexTheta`'s two `emitDiagnosticBatch` calls in
    // `src/lexer/lexer.ts`) before this parse ran; re-delivering them here
    // (`runComposePass`'s
    // `sink.emitGroup(parsed.dropped)`) would double-deliver every lex row. Exclude by object identity (a `Set`, not a code-
    // prefix test — `theta/parse/*` spans both the lex and parse phases, so a
    // prefix cannot tell them apart). `subagentFnFraming` is computed here, not
    // by the lexer, so it is never in `deliveredDiagnostics` and always ships.
    const delivered = new Set<Diagnostic>(document.deliveredDiagnostics);
    const undeliveredDocumentDiagnostics = document.diagnostics.filter(
      (diagnostic) => !delivered.has(diagnostic),
    );
    return { dropped: [...undeliveredDocumentDiagnostics, ...subagentFnFraming] };
  }
  return {
    fixture: {
      slashName: theta.name,
      sourcePath: theta.path,
      frontmatter: document.frontmatter,
      body: document.body,
    },
    // The registering path's document batch (warning-severity by the gate
    // above); the caller forwards it into the load-diagnostic sink as one
    // per-file group. No `deliveredDiagnostics` filter needed here: every
    // lexer-surfaced code is error-severity (bug 0255 §Affected), so any row
    // in `document.deliveredDiagnostics` would have tripped `hasLoadParseError`
    // above and taken the dropped arm instead — this arm's `document.diagnostics`
    // can only hold warning-severity rows the lexer never produces.
    diagnostics: document.diagnostics,
  };
}

/**
 * Split the `--theta` CLI flag value into discovery-source paths.
 *
 * Against the pinned host at most ONE string arrives here: pi's argv parser
 * stores extension flags in an unknownFlags Map (dist/cli/args.js), so a
 * repeated flag resolves to its LAST occurrence, and `pi.getFlag` is declared
 * `boolean | string | undefined` (dist/core/extensions/types.d.ts) — no array
 * can ever be delivered. Multi-root carriage is the single
 * `path.delimiter`-joined value (the discovery CLI-source convention; the
 * bug-0008 launcher fix emits exactly that form): each occurrence is split on
 * the platform PATH_DELIMITER, trimmed, empties dropped, and the de-duplicated
 * union returned. The array branch is therefore unreachable against the pinned
 * host and is KEPT deliberately as fail-safe hardening: were a future host to
 * surface repeated extension flags as an array, the pre-hardening
 * `typeof raw !== "string"` guard would have silently discarded EVERY
 * user-supplied path — the exact silent-root-loss class bug 0008 is about — so
 * the additive branch stays as cheap insurance.
 */
export function readThetaFlagPaths(pi: ExtensionAPI): readonly string[] {
  const raw: unknown = pi.getFlag("theta");
  const occurrences: string[] = Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === "string")
    : typeof raw === "string"
      ? [raw]
      : [];
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const occurrence of occurrences) {
    for (const entry of occurrence.split(PATH_DELIMITER)) {
      const trimmed = entry.trim();
      if (trimmed.length > 0 && !seen.has(trimmed)) {
        seen.add(trimmed);
        paths.push(trimmed);
      }
    }
  }
  return paths;
}

/**
 * The Pi-owned commands the cross-format collision check consults: the current
 * command snapshot filtered to the collision source set (`prompt` / `skill` /
 * `extension`). Read read-only-by-convention (PIC-39).
 */
export function readPiOwnedCommands(
  pi: ExtensionAPI,
  excludeOwnedNames?: ReadonlySet<string>,
): readonly PiOwnedCommand[] {
  const owned: PiOwnedCommand[] = [];
  for (const command of pi.getCommands()) {
    if (
      command.source !== "prompt" &&
      command.source !== "skill" &&
      command.source !== "extension"
    ) {
      continue;
    }
    // PIC-69: the exclusion MUST be source-conditioned, never name-only —
    // gated here (after the source-membership test above) on
    // `source === "extension"` so only an entry indistinguishable from this
    // instance's own registration (Pi reports every extension's registered
    // command this way) is ever excluded. A `"prompt"` / `"skill"` entry of a
    // name this instance also registered still lands in the collision set, so
    // the source gate is tested FIRST: a name-only membership test would
    // silently swallow that genuine `prompt`/`skill` collision as well.
    if (command.source === "extension" && excludeOwnedNames?.has(command.name) === true) {
      continue;
    }
    owned.push({ name: command.name, path: command.sourceInfo?.path });
  }
  return owned;
}
