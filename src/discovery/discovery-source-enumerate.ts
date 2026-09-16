// Per-source candidate enumeration and classification for the discovery
// walk: collecting a directory's byte-exact `*.theta` candidates
// (`enumerateDirectory`), resolving one source entry — a directory root or
// an explicit `.theta` file — into raw candidates (`resolveEntry`), and the
// bug 0363 on-disk-entry lookup an explicit file reference needs
// (`onDiskFileCandidate`), plus the shared per-source failure-diagnostic
// mint (`emitSourceFailure`). Split out of discovery-walk.ts as PTQ-0367
// (pre-announced by PTQ-0333 as "concern 1"): every member here was
// file-private in discovery-walk.ts before the split; `RawCandidate`,
// `enumerateDirectory`, `onDiskFileCandidate`, `resolveEntry`, and
// `emitSourceFailure` are exported because discovery-walk.ts's
// `collectFromEntries` (the five-source driver) and `resolveSettingsSource`
// (the settings `thetaPaths` sub-walk) import them back;
// `isCanonicalDuplicate` and `classifyForSource` stay module-private, called
// only from within this file. This module imports nothing from
// discovery-walk.ts — the cycle guard, since discovery-walk.ts imports FROM
// here.
//
// Spec: discovery.md, discovery/discovery-sources.md (DISC-2, DISC-3), with
// the `theta/load/*` diagnostic codes/messages sourced from
// diagnostics/code-registry-load.md.

import type { Diagnostic, Severity } from "../diagnostics/diagnostic";
import type { FileSystem } from "../seams/file-system";
import { nodeErrorCode } from "./node-error-code";
import {
  ancestorsClean,
  basename,
  classifyPath,
  dirnameOf,
  joinPosix,
  normalizePath,
  realpathOr,
  renderSourceDescriptor,
  splitExtension,
  type EnoentPolicy,
  type PathClass,
} from "./discovery-path-classify";
import {
  INVALID_EXTENSION,
  MISSING_SOURCE,
  MODES_BY_SOURCE,
  NON_CANONICAL_EXTENSION,
  SLASH_NAME,
  UNREADABLE_SOURCE,
  WRONG_TYPE_SOURCE,
  type DiscoverySource,
} from "./discovery-model";

/** A `*.theta` file found under a source, before validity/collision resolution. */
export interface RawCandidate {
  readonly path: string;
  readonly stem: string;
}

/** Enumerate one directory: collect byte-exact `*.theta` candidates and emit
 *  per-directory `non-canonical-extension` warnings (DISC-3). A root
 *  `classifyPath` already accepted as a directory whose enumeration then
 *  fails is an unreadable (or, on a clean `ENOENT` ancestor chain, missing)
 *  source, not silence (discovery-sources.md:73) — the calling source's
 *  descriptor is threaded through, and its failure severities looked up from
 *  `source` (`MODES_BY_SOURCE`, PTQ-0366), so the failure emits from the one
 *  place the rejection is observed. */
export async function enumerateDirectory(
  fs: FileSystem,
  dir: string,
  source: Exclude<DiscoverySource, "package">,
  descriptorValue: string,
  diagnostics: Diagnostic[],
): Promise<RawCandidate[]> {
  const modes = MODES_BY_SOURCE[source];
  const entries = await fs.readdir(dir).then(
    (names) => ({ ok: true as const, names }),
    (error: unknown) => ({ ok: false as const, code: nodeErrorCode(error) }),
  );
  if (!entries.ok) {
    if (entries.code === "ENOENT" && (await ancestorsClean(fs, dir))) {
      emitSourceFailure(modes.missing, source, descriptorValue, dir, diagnostics, "missing");
    } else {
      emitSourceFailure(modes.unreadable, source, descriptorValue, dir, diagnostics, "unreadable");
    }
    return [];
  }
  const candidates: RawCandidate[] = [];
  const canonicalNames = new Set<string>();
  for (const name of entries.names) {
    const { ext } = splitExtension(name);
    if (ext === "theta" || ext === "thetalib") {
      canonicalNames.add(name);
    }
  }
  for (const name of entries.names) {
    const { stem, ext } = splitExtension(name);
    const lower = ext.toLowerCase();
    const full = joinPosix(dir, name);
    if (ext === "theta") {
      candidates.push({ path: full, stem });
      continue;
    }
    if (ext === "thetalib") {
      // Library file — importable, never a slash command; not discovered.
      continue;
    }
    if ((lower === "theta" || lower === "thetalib") && SLASH_NAME.test(stem)) {
      // Case-variant extension on a valid stem → non-canonical warning, unless
      // it deduplicates against a byte-exact canonical sibling (case-insensitive
      // filesystems surface one entry under two spellings) via `realpath`.
      if (await isCanonicalDuplicate(fs, full, dir, canonicalNames)) {
        continue;
      }
      diagnostics.push({
        severity: "warning",
        code: NON_CANONICAL_EXTENSION,
        file: full,
        message: `file '${full}' has non-canonical extension case; rename to lowercase '.theta' or '.thetalib'`,
      });
    }
  }
  return candidates;
}

/** True when `nonCanonicalPath` resolves (via `realpath`) to the same canonical
 *  path as some byte-exact `.theta`/`.thetalib` sibling in `dir`. */
async function isCanonicalDuplicate(
  fs: FileSystem,
  nonCanonicalPath: string,
  dir: string,
  canonicalNames: ReadonlySet<string>,
): Promise<boolean> {
  if (canonicalNames.size === 0) {
    return false;
  }
  const target = await realpathOr(fs, nonCanonicalPath);
  if (target === undefined) {
    return false;
  }
  for (const name of canonicalNames) {
    const sibling = await realpathOr(fs, joinPosix(dir, name));
    if (sibling !== undefined && sibling === target) {
      return true;
    }
  }
  return false;
}

/** Bug 0363: for an EXPLICIT file reference (a CLI `--theta` component or a
 *  settings `thetaPaths` literal/glob match) the slash name and candidate path
 *  must come from the ON-DISK directory entry, not the reference's own
 *  spelling. A case-insensitive host resolves a case-variant reference to the
 *  real file, and DISC-3 Filename validity pins the slash name to that file's
 *  own stem taken verbatim — so `Plan.theta` reached via `plan.theta` is judged
 *  on `Plan` (refused) and `good.theta` reached via `GOOD.theta` registers
 *  `/good`. `readdir` the parent and take the entry the filesystem resolved: a
 *  byte-exact name wins (a case-sensitive host can hold `good.theta` and
 *  `GOOD.theta` as distinct entries, and the reference named exactly one), else
 *  the case-insensitive host's unique fold answers. This makes the explicit-file
 *  arm consistent with the enumeration arm (`enumerateDirectory`, whose
 *  candidates already carry `readdir` names). When the parent cannot be
 *  enumerated the reference spelling is the best available answer —
 *  classification already proved a file is present, so this is not the common
 *  path. */
export async function onDiskFileCandidate(fs: FileSystem, path: string): Promise<RawCandidate> {
  const norm = normalizePath(path);
  const dir = dirnameOf(norm);
  const wanted = basename(norm);
  const wantedLower = wanted.toLowerCase();
  // A bare `X:` drive spec is drive-RELATIVE on Windows (the cwd on that drive);
  // the drive root is `X:/`, so enumerate that form while the returned candidate
  // path still joins the bare `dir` (paths stay `C:/plan.theta`, never `C://`).
  const dirForReaddir = /^[A-Za-z]:$/.test(dir) ? `${dir}/` : dir;
  const names = await fs.readdir(dirForReaddir).then(
    (entries) => entries,
    () => undefined,
  );
  if (names !== undefined) {
    let folded: string | undefined;
    for (const name of names) {
      if (name === wanted) {
        return { path: joinPosix(dir, name), stem: splitExtension(name).stem };
      }
      if (folded === undefined && name.toLowerCase() === wantedLower) {
        folded = name;
      }
    }
    if (folded !== undefined) {
      return { path: joinPosix(dir, folded), stem: splitExtension(folded).stem };
    }
  }
  return { path: norm, stem: splitExtension(wanted).stem };
}

/** Resolve one source entry (a directory root, or a single `.theta` file) into
 *  raw candidates, emitting the per-source failure diagnostic on any miss.
 *  `descriptor` names an EXPLICIT file entry (CLI `--theta` / settings
 *  `thetaPaths`) for the `invalid-extension` message; a conventional root is
 *  directory-only, never routes to that arm, and so carries none. */
export async function resolveEntry(
  fs: FileSystem,
  path: string,
  descriptor: string | undefined,
  source: Exclude<DiscoverySource, "package">,
  descriptorValue: string,
  enoentPolicy: EnoentPolicy,
  diagnostics: Diagnostic[],
  roots: Set<string>,
): Promise<RawCandidate[]> {
  const modes = MODES_BY_SOURCE[source];
  const resolved = classifyForSource(await classifyPath(fs, path, enoentPolicy), path, descriptor !== undefined);
  switch (resolved.kind) {
    case "dir":
      roots.add(normalizePath(path));
      return enumerateDirectory(fs, path, source, descriptorValue, diagnostics);
    case "file":
      // A single `.theta` file entry contributes itself directly. Bug 0363: the
      // slash name and candidate path come from the ON-DISK directory entry,
      // not this reference's own spelling.
      roots.add(dirnameOf(normalizePath(path)));
      return [await onDiskFileCandidate(fs, path)];
    case "invalid-extension":
      // An explicit file reference (CLI `--theta` / settings `thetaPaths`) that
      // resolves to a non-`.theta` regular file is an `invalid-extension` error
      // per Lexical §"Extension matching" — the settings/CLI extension check —
      // not `wrong-type-source`. The file does not register. Only an explicit
      // entry reaches this arm (`classifyForSource` gates the kind on
      // `explicitFile`) and every explicit entry names itself, so `descriptor`
      // is present here.
      diagnostics.push({
        severity: "error",
        code: INVALID_EXTENSION,
        file: normalizePath(path),
        message: `'${descriptor!}' resolves to '${normalizePath(path)}' which does not end in .theta`,
      });
      return [];
    case "missing":
      emitSourceFailure(modes.missing, source, descriptorValue, path, diagnostics, "missing");
      return [];
    case "unreadable":
      emitSourceFailure(modes.unreadable, source, descriptorValue, path, diagnostics, "unreadable");
      return [];
    case "wrong-type":
      emitSourceFailure(modes.wrongType, source, descriptorValue, path, diagnostics, "wrong-type");
      return [];
  }
}

/** Classify a resolved path for a source. A regular file whose name does not
 *  end in `.theta` is, for an *explicit file reference* (CLI `--theta` / settings
 *  `thetaPaths`), an `invalid-extension` error; for a *conventional root*
 *  (directory-only) it is `wrong-type` — the root is neither a `.theta` file nor
 *  a directory. */
function classifyForSource(
  cls: PathClass,
  path: string,
  explicitFile: boolean,
): PathClass {
  if (cls.kind === "file" && splitExtension(basename(path)).ext !== "theta") {
    return explicitFile ? { kind: "invalid-extension" } : { kind: "wrong-type" };
  }
  return cls;
}

// Renders the failure-mode rows' `<descriptor>` in the normative
// `<kind>:"<value>"` form (placeholder-rendering-b.md §5) — the same grammar
// the cross-source-shadow mint (`renderDescriptor`) already uses, so one
// source rejected by two different observers (a shadow note and a failure
// note) never renders under two grammars for the same pass (bug 0461).
export function emitSourceFailure(
  severity: Severity | null,
  source: DiscoverySource,
  descriptorValue: string,
  path: string,
  diagnostics: Diagnostic[],
  kind: "missing" | "unreadable" | "wrong-type",
): void {
  if (severity === null) {
    return; // conventional silent-on-missing
  }
  const descriptor = renderSourceDescriptor(source, descriptorValue);
  // `code` is a fixed 1:1 function of `kind` (code-registry-load.md), the
  // same three-way split `message` below already branches on.
  const code = kind === "missing" ? MISSING_SOURCE : kind === "unreadable" ? UNREADABLE_SOURCE : WRONG_TYPE_SOURCE;
  const message =
    kind === "missing"
      ? `discovery source path does not exist: ${descriptor}`
      : kind === "unreadable"
        ? `discovery source is unreadable: ${descriptor}`
        : `discovery source ${descriptor} is neither a .theta file nor a directory of them`;
  diagnostics.push({ severity, code, file: normalizePath(path), message });
}
