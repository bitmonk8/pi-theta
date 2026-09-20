// Cross-source-shadow / cross-format-collision resolution for the discovery
// walk (the theta always loses, asymmetrically), plus the intra-source
// case-collision resolution that feeds it. Split out of discovery-walk.ts as
// PTQ-0333 (pre-announced by PTQ-0305's Seam 0 as "concern 5"): every member
// here was file-private in discovery-walk.ts before the split;
// `sourceLabelOf`, `resolveBySource`, `validateAndRead`, and
// `resolveSlashNames` are exported because `discoverThetas` (still in
// discovery-walk.ts) imports them back. This module imports nothing from
// discovery-walk.ts — the cycle guard, since discovery-walk.ts imports FROM
// here.
//
// Spec: discovery.md, discovery/discovery-sources.md (DISC-3, DISC-4), with
// the `theta/load/*` diagnostic codes/messages sourced from
// diagnostics/code-registry-load.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { FileSystem } from "../seams/file-system";
import { normalizePath, renderSourceDescriptor } from "./discovery-path-classify";
import {
  CASE_COLLISION,
  CROSS_FORMAT_COLLISION,
  CROSS_SOURCE_SHADOW,
  INVALID_SLASH_NAME,
  PRIORITY,
  SLASH_NAME,
  UNREADABLE_FILE,
  type DiscoveredTheta,
  type DiscoverySource,
  type PiOwnedCommand,
  type SourcedCandidate,
} from "./discovery-model";

/** Resolve intra-source case-collisions (DISC-3): two `*.theta` paths differing
 *  only in case collide; the byte-first path wins, the rest drop. */
function resolveCaseCollisions(
  candidates: readonly SourcedCandidate[],
  diagnostics: Diagnostic[],
): SourcedCandidate[] {
  const groups = Map.groupBy(candidates, (candidate) => normalizePath(candidate.path).toLowerCase());
  const survivors: SourcedCandidate[] = [];
  for (const bucket of groups.values()) {
    const distinct = dedupeByPath(bucket);
    if (distinct.length === 1) {
      survivors.push(distinct[0]!);
      continue;
    }
    const sorted = [...distinct].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const winner = sorted[0]!;
    diagnostics.push({
      severity: "warning",
      code: CASE_COLLISION,
      file: winner.path,
      message: `case-insensitive filename collision in ${winner.sourceLabel}: '${sorted[0]!.path}' and '${sorted[1]!.path}'`,
    });
    survivors.push(winner);
  }
  return survivors;
}

/** Bug 0486: read a file's bytes, or `undefined` if the read fails — the
 *  fail-OPEN carrier for the cross-source-shadow byte comparison (a read we
 *  cannot complete cannot prove byte-identity, so its caller surfaces the
 *  warning rather than suppressing it). */
async function readBytesOrUndefined(fs: FileSystem, path: string): Promise<Uint8Array | undefined> {
  return fs.readBytes(path).then(
    (bytes) => bytes,
    () => undefined,
  );
}

/** Drop entries resolving to the same byte-exact path (a source reaching one
 *  directory through two entries dedupes silently before collision detection). */
function dedupeByPath(candidates: readonly SourcedCandidate[]): SourcedCandidate[] {
  const seen = new Set<string>();
  const out: SourcedCandidate[] = [];
  for (const candidate of candidates) {
    const key = normalizePath(candidate.path);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(candidate);
    }
  }
  return out;
}

export function sourceLabelOf(source: DiscoverySource): string {
  switch (source) {
    case "cli":
      return "--theta flag";
    case "settings":
      return "settings thetaPaths";
    case "project":
      // The host config-dir name is unavailable at this pure-label seam, so the
      // Pi spelling stands in for the source CATEGORY here. This label is what
      // the case-collision message above (`case-insensitive filename collision
      // in ${sourceLabel}`) names — the path-bearing project diagnostics render
      // the normative `<kind>:"<value>"` descriptor form instead, so this
      // prose spelling never has to stand in for a real directory there.
      return "project .pi/theta/";
    case "package":
      return "package theta/ directory";
    case "global":
      return "global thetas directory";
  }
}

/** Render one candidate as the normative `<kind>:"<value>"` descriptor
 *  (placeholder-rendering-b.md §5/§7) — the mint site for the
 *  cross-source-shadow `<higher>`/`<lower>` placeholders must render this
 *  form, not a bare candidate path. */
export function renderDescriptor(candidate: SourcedCandidate): string {
  return renderSourceDescriptor(candidate.source, candidate.descriptorValue);
}

/** Apply case-collision resolution independently within each source. */
export function resolveBySource(
  candidates: readonly SourcedCandidate[],
  diagnostics: Diagnostic[],
): SourcedCandidate[] {
  const bySource = Map.groupBy(candidates, (candidate) => candidate.source);
  const out: SourcedCandidate[] = [];
  for (const bucket of bySource.values()) {
    out.push(...resolveCaseCollisions(bucket, diagnostics));
  }
  return out;
}

/** Validate each surviving candidate's slash name, then confirm readability of
 *  the underlying `.theta` file (DISC-2 rule 1 / DISC-3 Filename validity). */
export async function validateAndRead(
  fs: FileSystem,
  candidates: readonly SourcedCandidate[],
  diagnostics: Diagnostic[],
): Promise<SourcedCandidate[]> {
  const out: SourcedCandidate[] = [];
  for (const candidate of candidates) {
    if (!SLASH_NAME.test(candidate.stem)) {
      diagnostics.push({
        severity: "error",
        code: INVALID_SLASH_NAME,
        file: candidate.path,
        message:
          "slash names must be lowercase kebab/snake; rename the file (e.g. `code-review.theta`)",
        hint: "Slash names must be lowercase kebab/snake; rename the file (e.g. `code-review.theta`).",
      });
      continue;
    }
    const readable = await fs.readBytes(candidate.path).then(
      () => true,
      () => false,
    );
    if (!readable) {
      diagnostics.push({
        severity: "warning",
        code: UNREADABLE_FILE,
        file: candidate.path,
        message: `.theta file is unreadable: '${candidate.path}'`,
      });
      continue;
    }
    out.push(candidate);
  }
  return out;
}

/** Bug 0331: within one name group, collapse candidates whose
 *  separator-normalized path is identical down to ONE candidate, keeping the
 *  HIGHEST-priority (lowest `PRIORITY` number) tier — one physical file is one
 *  candidate, regardless of how many discovery sources reach it. Regime-
 *  independent (runs for every group, not just a marked root): a source
 *  reaching the SAME file via a different separator spelling is not a
 *  distinct copy, so it must not draw its own cross-source-shadow warning.
 *  Genuinely-distinct files (different normalized paths) are untouched —
 *  separator normalization alone decides identity here, deliberately short of
 *  `fs.realpath` (parent-side symlink/`..` semantics for distinct files stay
 *  exactly as today). Map iteration preserves each surviving key's first-seen
 *  position, so diagnostic message ordering for the untouched groups is
 *  unaffected. */
function dedupeByIdentity(group: readonly SourcedCandidate[]): SourcedCandidate[] {
  const byPath = new Map<string, SourcedCandidate>();
  for (const candidate of group) {
    const key = normalizePath(candidate.path);
    const existing = byPath.get(key);
    if (existing === undefined || PRIORITY[candidate.source] < PRIORITY[existing.source]) {
      byPath.set(key, candidate);
    }
  }
  return [...byPath.values()];
}

/** Shared `<paths>` ordering for both `theta/load/cross-format-collision`
 *  arms (placeholder-rendering-b.md:57): discovery-source PRIORITY first,
 *  then byte-wise normalised (forward-slash) absolute path — a single
 *  comparator so the same-format and Pi-owned mints cannot drift apart
 *  again (0459 §Fix Residual 2). */
function collisionPathOrder(a: SourcedCandidate, b: SourcedCandidate): number {
  if (PRIORITY[a.source] !== PRIORITY[b.source]) return PRIORITY[a.source] - PRIORITY[b.source];
  const na = normalizePath(a.path);
  const nb = normalizePath(b.path);
  return na < nb ? -1 : na > nb ? 1 : 0;
}

/** Resolve cross-source-shadow (different priority → higher wins) and
 *  cross-format-collision (same priority theta-vs-theta, or theta-vs-Pi-owned;
 *  the theta always loses asymmetrically) over the validated candidates.
 *  Bug 0331: identity-dedup runs first (regime-independent); then, past the
 *  Pi-owned guard (a Pi-owned collision is decided first), a marked-root
 *  pre-emption scoped to `markedRoot?.slug` (regime-gated) may register that
 *  group's winner alone before the tier adjudication runs. */
export async function resolveSlashNames(
  fs: FileSystem,
  candidates: readonly SourcedCandidate[],
  piOwned: readonly PiOwnedCommand[],
  diagnostics: Diagnostic[],
  markedRoot?: { readonly slug: string; readonly winnerPath: string },
): Promise<DiscoveredTheta[]> {
  const piOwnedByName = Map.groupBy(piOwned, (command) => command.name);
  const byName = Map.groupBy(candidates, (candidate) => candidate.stem);

  const thetas: DiscoveredTheta[] = [];
  for (const [name, rawGroup] of byName) {
    const group = dedupeByIdentity(rawGroup);

    // Theta-vs-Pi-owned: the theta always loses; the Pi-owned entry survives.
    // `<paths>` is the registered theta candidate(s) first (priority-then-path
    // ordered), then the colliding `.md`-sibling tail (placeholder-rendering-b.md:57);
    // a foreign extension command carrying no host path falls back to its
    // registered name (0459 §Fix adjudication rider) — no survives-suffix.
    if (piOwnedByName.has(name)) {
      const thetaPaths = [...group]
        .sort(collisionPathOrder)
        .map((candidate) => normalizePath(candidate.path));
      const siblingPaths = (piOwnedByName.get(name) ?? [])
        .map((command) => (command.path !== undefined && command.path !== "" ? normalizePath(command.path) : command.name))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      diagnostics.push({
        severity: "error",
        code: CROSS_FORMAT_COLLISION,
        message: `slash name '${name}' collides at the same priority: ${[...thetaPaths, ...siblingPaths].join(", ")}`,
      });
      continue;
    }

    // Bug 0331: marked-root pre-emption, scoped to `markedRoot.slug` alone,
    // adjudicated AFTER the Pi-owned guard above because a Pi-owned collision
    // is decided FIRST. The parent's carrier resolved this slug across theta
    // TIERS, not against Pi-ownedness, so a name a foreign extension owns in
    // the child (but not the parent) takes the Pi-owned arm and drops the
    // theta — the theta never pre-empts a non-theta registration
    // (discovery-sources.md#disc-4), matching the parent. Past that guard,
    // when the parent-named winner survives dedup here it registers ALONE —
    // no cross-format-collision / cross-source-shadow diagnostic — and every
    // sibling for THIS slug drops silently. A winner that names no surviving
    // candidate (absent carrier, hostile value, stale path) falls through to
    // today's tier adjudication below — the safe fallback the trust boundary
    // and the skew fence both rely on.
    if (markedRoot !== undefined && name === markedRoot.slug) {
      const winnerKey = normalizePath(markedRoot.winnerPath);
      const winner = group.find((candidate) => normalizePath(candidate.path) === winnerKey);
      if (winner !== undefined) {
        thetas.push({ name, path: winner.path, source: winner.source });
        continue;
      }
    }

    const minPriority = Math.min(...group.map((candidate) => PRIORITY[candidate.source]));
    const topTier = group.filter((candidate) => PRIORITY[candidate.source] === minPriority);
    const lowerTier = group.filter((candidate) => PRIORITY[candidate.source] !== minPriority);

    if (topTier.length > 1) {
      // Same-priority theta-vs-theta: every colliding theta drops. `<paths>`
      // is priority-then-absolute-path ordered (placeholder-rendering-b.md:57),
      // not collection/insertion order.
      diagnostics.push({
        severity: "error",
        code: CROSS_FORMAT_COLLISION,
        message: `slash name '${name}' collides at the same priority: ${[...topTier]
          .sort(collisionPathOrder)
          .map((candidate) => normalizePath(candidate.path))
          .join(", ")}`,
      });
      continue;
    }

    const winner = topTier[0]!;
    // Bug 0486: a shadow whose bytes are IDENTICAL to the winner's cannot
    // change behaviour (the precedence is correct and the winner is the
    // intended copy) — it is the structural double a relocated-cwd subagent
    // child sees when ambient discovery re-finds the same worker file through
    // the project walk-up and the settings entry (RFC 0009 §4). Suppress the
    // warning for that case; a shadow with DIFFERING content (a stale copy
    // silently losing to — or in a priority inversion, winning over — the
    // current one) is the real hazard the diagnostic exists for and still
    // warns. The winner's bytes are read at most once per group, and only
    // when there is a lower tier to compare against; a read failure on either
    // side fails OPEN to the warning (we cannot prove identity, so we surface).
    const winnerBytes = lowerTier.length > 0 ? await readBytesOrUndefined(fs, winner.path) : undefined;
    for (const shadowed of lowerTier) {
      if (winnerBytes !== undefined) {
        const shadowedBytes = await readBytesOrUndefined(fs, shadowed.path);
        // `Buffer.compare` (Node global, no import) is the native byte compare
        // over the full content of both views; a length difference is non-zero.
        if (shadowedBytes !== undefined && Buffer.compare(winnerBytes, shadowedBytes) === 0) {
          // Byte-identical: drop silently, no diagnostic.
          continue;
        }
      }
      // Different priority: the higher-priority source wins; the rest shadow.
      diagnostics.push({
        severity: "warning",
        code: CROSS_SOURCE_SHADOW,
        message: `slash name '${name}' shadowed across discovery sources: '${renderDescriptor(winner)}' wins over '${renderDescriptor(shadowed)}'`,
      });
    }
    thetas.push({ name, path: winner.path, source: winner.source });
  }

  return thetas;
}
