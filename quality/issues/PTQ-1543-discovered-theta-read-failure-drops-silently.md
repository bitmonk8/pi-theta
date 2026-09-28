---
id: PTQ-1543
title: parseDiscoveredTheta drops a discovered `.theta` whose readBytes rejects with an empty diagnostic batch, while validateAndRead reports the same readBytes rejection on the same file as a theta/load/unreadable warning
lens: D6
status: open
verdict: confirmed
locations:
  - src/extension/production-discovered-theta.ts:97-105
  - src/extension/production-composition.ts:1067-1080
  - src/discovery/discovery-collision-resolve.ts:148-160
  - src/discovery/discovery-walk.ts:568-571
  - src/extension/production-composition.ts:1495-1507
sites: 5
fix_scope: module
d6_class: posture-divergence
d6_anchor: "docs/spec_topics/discovery/discovery-sources.md:66 DISC-2 rule 1 — \"Discoverable `.theta` files that are themselves unreadable (broken symlink, transient I/O error, EACCES on the file itself) are reported as `theta/load/unreadable` *warnings* regardless of source, and the theta is not registered\""
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# parseDiscoveredTheta drops a discovered `.theta` whose readBytes rejects with an empty diagnostic batch, while validateAndRead reports the same readBytes rejection on the same file as a theta/load/unreadable warning

## Observation
Each discovered `.theta` has its bytes read twice in one load pass. The first read is in the discovery walk. `validateAndRead` (discovery-collision-resolve.ts) calls `fs.readBytes(candidate.path)`, throws the bytes away, and on a rejection pushes a `theta/load/unreadable` warning and removes the candidate. The second read is in the compose pass. `parseDiscoveredTheta` (production-discovered-theta.ts) reads the same path again through `readThetaBytes`, which turns any rejection into `undefined`. On `undefined` it returns `{ dropped: [] }`. The one caller passes that to `sink.emitGroup([])` and `continue`s. So when the second read rejects, the theta is un-registered and no diagnostic is emitted. When the first read rejects on the same path, the pass warns.

## Evidence
**Divergent side (silent drop)**: src/extension/production-discovered-theta.ts:97-105
```ts
export async function parseDiscoveredTheta(
  fs: FileSystem,
  theta: DiscoveredTheta,
  deps: PassParseDeps,
): Promise<ParsedDiscoveredTheta> {
  const bytes = await readThetaBytes(fs, theta.path);
  if (bytes === undefined) {
    return { dropped: [] };
  }
```
`readThetaBytes` (same file, :49-57) is `fs.readBytes(path).then((value) => value, () => undefined)`: every rejection code becomes `undefined`.

The only caller, src/extension/production-composition.ts:1067-1080, delivers the empty drop batch and un-registers the theta:
```ts
  // Parse pass: parse every discovered theta into its composition input; a drop
  // surfaces its load/parse diagnostics (FM-3 / DIAG-1) and does not register.
  const parsedInputs: ThetaCompositionInput[] = [];
  for (const theta of discovered) {
    // Bug 0264: pass the pass-scoped `parseDeps` so this discovery parse
    // rides the same pass cache every other walk below does.
    const parsed = await parseDiscoveredTheta(fileSystem, theta, parseDeps);
    if ("dropped" in parsed) {
      // FM-3: surface the load/parse diagnostics that un-registered this theta,
      // as ONE per-file group — errors route per-diagnostic; any warnings
      // co-fired in the same dropped batch deliver as one batched note.
      sink.emitGroup(parsed.dropped);
      continue;
    }
```

**Sibling side (warns)**: src/discovery/discovery-collision-resolve.ts:148-160, the `validateAndRead` readability probe run on the same candidate path earlier in the same pass:
```ts
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
```
How the sibling feeds the divergent side. src/discovery/discovery-walk.ts:568-571 runs it over every candidate:
```ts
  // Per-source case-collision, then slash-name validity + per-file readability,
  // then cross-source/format collision resolution over the survivors.
  const caseResolved = resolveBySource(candidates, diagnostics);
  const valid = validateAndRead(fs, caseResolved, diagnostics);
```
src/extension/production-composition.ts:1495-1507 (`resolvePassInputs`) emits the walk's diagnostics through the same pass `sink` and hands the survivors, as `discovered`, to the parse loop cited above:
```ts
  const walk = await discoverThetas({
    fs: fileSystem,
    ...
  });
  sink.emitGroup(walk.diagnostics);
  const discovered: DiscoveredTheta[] = [...walk.thetas];
```

**Why these are the same failure class:** both sites call `fs.readBytes` on the same `DiscoveredTheta` path, through the same `FileSystem` seam instance (`root.fileSystem`), in the same `runComposePass` invocation. Both fold the rejection with a `.then(ok, () => …)` handler that does not look at the error code, and both respond by not registering the theta. The only difference is what each tells the author. `validateAndRead` delivers `theta/load/unreadable` through `sink`. `parseDiscoveredTheta` delivers an empty group through the same `sink`. The second read can only reject if the file's readability changes between the two reads (EACCES applied, file removed, transient I/O). The anchor names that case explicitly ("transient I/O error").

**Anchor**, quoted from docs/spec_topics/discovery/discovery-sources.md:66:
> 1. **Discoverable `.theta` files that are themselves unreadable** (broken symlink, transient I/O error, EACCES on the file itself) are reported as `theta/load/unreadable` *warnings* regardless of source, and the theta is not registered. The scan continues; one bad file does not poison the rest.

The divergent site's own comment (production-discovered-theta.ts:118-121) states the rule that an empty batch breaks: "FM-3: return the load-phase diagnostics so the caller emits them. DIAG-1 requires every author-visible drop to carry its registry code/message; previously these were computed here and silently discarded, so a `mode:` typo made the command vanish with no feedback." The `bytes === undefined` arm is the one drop arm in the function that carries no code.

Searches run this session:
- `grep -rn "dropped: \[\]" src --include=*.ts | wc -l` → 1 (production-discovered-theta.ts:104).
- `grep -rn "UNREADABLE_FILE" src` → 3 hits: the constant (discovery-model.ts:127), its import (discovery-collision-resolve.ts:26), and the single mint (discovery-collision-resolve.ts:155). The compose-pass read path has no mint of `theta/load/unreadable`.
- `grep -rn "parseDiscoveredTheta(" src --include=*.ts | wc -l` → 2 (the definition at production-discovered-theta.ts:97 and the single call at production-composition.ts:1073).

## Why this is a problem
The anchor says an unreadable discoverable `.theta` is reported as `theta/load/unreadable` "regardless of source", and the theta is not registered. Two reads in one pass handle that failure. The discovery-walk read follows the anchor. The compose-pass read un-registers the theta with no code. A user whose `.theta` becomes unreadable after the walk's probe sees the slash command disappear and gets no note. Headless, the raw `/stem …` text goes to the model as chat, which is the "vanish with no feedback" outcome the FM-3 comment at the divergent site says it removed.

## Suggested direction (non-binding, optional)
Make the compose-pass read failure produce the same diagnostic the walk's read failure produces, for example by returning a `theta/load/unreadable` warning in `dropped`. Another option is to carry the bytes `validateAndRead` already read so that the compose pass has no second read that can fail.

## False-positive check
- **EXST-9 / PIC-73 class check:** not applicable. Both sites are in the load-time discovery/compose pass. Neither is an execution-status sink or producer hook, and neither is a degrade-silent optional capability. The failed read un-registers a theta, which PIC-73's "absence refuses nothing" class does not cover.
- **allow-broad-catch token check:** no `catch` clause is cited. Both sides fold rejections in Promise `.then` handlers, which the `readThetaBytes` doc-comment (production-discovered-theta.ts:43-48) calls the house idiom ("the caller decides what an unreadable file means at its site"). No token applies. The finding concerns what the caller decides at this site.
- **Stated-rationale check:** no comment near :103-105 justifies the empty batch. The comment block at :106-142 covers only the parse-gate drop arm, and it states the opposite posture (DIAG-1: every drop carries its code). `git log -S "return { dropped: [] };" -- src/extension` names two commits. 65e384df ("fix(load): surface silently-dropped loom diagnostics (FM-3/FM-4/FM-5)") changed this arm from `return undefined` to `return { dropped: [] }` only for the union return type and gave no reason for leaving it empty. 7281a593 is the D9 file split that moved it. No docs/bugs ruling covers this arm: `grep -rln "dropped: \[\]" docs/bugs` gave no hits.
- **Sibling-reality check:** both reads were checked this session. `validateAndRead` is called on every discovery candidate (discovery-walk.ts:571). Its survivors become `walk.thetas` and then `discovered` (production-composition.ts:1507-1508). `discovered` is the parse loop's iteration set (:1070). So every path `parseDiscoveredTheta` reads was probed by the sibling earlier in the same pass. The same shared helper handles an unreadable path at the other in-file `.theta` read gates, and each of those produces a coded outcome: `parseCalleeForTools` → `fileExists: false` → `theta/load/unresolvable-theta-path` (production-composition.ts:3465-3471), and `parseCalleeTheta` → `{ kind: "unreadable" }` → `load_failure` (:4537-4540). The silent arm is the outlier among them.
- **Already-filed check:** PTQ-1516 (resolved) covers the package-directory `lstat` pre-filter that stops files from reaching `validateAndRead`. This finding is the read after `validateAndRead`. PTQ-1420 (resolved, questionable) is D4 duplication of the load/parse gate and does not address the empty drop batch.

## Triage
verdict: confirmed — re-verified: parseDiscoveredTheta (production-discovered-theta.ts:97-105) turns a readThetaBytes rejection into `{ dropped: [] }`, and the only caller (production-composition.ts:1073-1079) does emitGroup([]) + continue, so the theta is un-registered with no diagnostic. validateAndRead (discovery-collision-resolve.ts:148-159) reads the same walk.thetas path earlier in the same pass and mints a theta/load/unreadable warning. All three searches reproduce (1 / 3 / 2 hits; the docs/bugs grep gives 0), and git -S names 65e384df and 7281a593. The anchor discovery-sources.md:66 DISC-2 rule 1 ("transient I/O error … reported as theta/load/unreadable warnings regardless of source") pins the warning side. No EXST-9/PIC-73 pin and no stated rationale covers the empty arm. No existing PTQ or intake file tracks it (triage: claude-opus-5-5)
