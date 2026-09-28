---
id: pending
title: production-subagent-host.ts builds the parent-private child temp file two ways — createProductionParamsFs bakes the mkdtemp/name/mode/swallow policy into a three-member fat seam while createProductionLaunchFileFs exposes seven primitives and leaves the policy to runtime/subagent-launch-file.ts — and the two have already diverged on directory cleanup and mode pinning
lens: D1
status: intake
verdict: pending
locations:
  - src/extension/production-subagent-host.ts:311-337
  - src/extension/production-subagent-host.ts:259-283
  - src/extension/production-producer-deps.ts:226-230
  - src/runtime/subagent-params.ts:114-122
  - src/runtime/subagent-params.ts:244-249
  - src/runtime/subagent-launch-file.ts:74-91
  - src/runtime/subagent-launch-file.ts:116-121
  - src/runtime/subagent-launch-file.ts:128-139
  - src/extension/subagent-spawn-regime.ts:762-776
sites: 9
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# production-subagent-host.ts builds the parent-private child temp file two ways — createProductionParamsFs bakes the mkdtemp/name/mode/swallow policy into a three-member fat seam while createProductionLaunchFileFs exposes seven primitives and leaves the policy to runtime/subagent-launch-file.ts — and the two have already diverged on directory cleanup and mode pinning

## Observation
Two RFCs hand the child a parent-private file it reads once and deletes: the PIC-60 params channel (RFC-0006, `PI_THETA_PARAMS_FILE`, ≥8 KB payloads) and the RFC-0012 §2 launch file (`--theta-launch <path>`). RFC 0012 names the params channel as its precedent, and `LAUNCH_FILE_MODE`'s docstring cites "the PIC-60 params-file precedent". Both production seams live in `src/extension/production-subagent-host.ts`, and they are the only two `mkdtempSync` / `tmpdir()` sites in `src/`. They are shaped differently: `createProductionParamsFs` is a fat seam whose `writeTempFile` performs mkdtemp + fixed file name + fixed mode inside the seam and whose `unlink` swallows its own error, with the runtime `ParamsMarshalDeps` / intake deps declared as two-member and the extension re-declaring the three-member union inline in `ProductionProducerInput`; `createProductionLaunchFileFs` is a thin seam of seven primitives (`mkdtemp(prefix, mode)`, `writeFile(path, contents, mode)`, `readFile`, `unlink`, `rmdir`, `ownerUid`, `currentUid`) with the directory prefix, file name, both modes, the ownership check, the swallowing and the directory removal living in `runtime/subagent-launch-file.ts`. Because the policy sits in different layers, the two channels already behave differently for the same lifecycle step: the launch-file backstop removes the private directory (`rmdir`) and pins the directory mode (`chmodSync(dir, mode)`); the params channel has no `rmdir` anywhere in `src/` and no directory-mode pin.

## Evidence

### Way A — fat seam, policy inside the production seam (PIC-60 params channel)

src/extension/production-subagent-host.ts:311-337:

```ts
export function createProductionParamsFs(): {
  writeTempFile: (contents: string) => string;
  unlink: (path: string) => void;
  readFile: (path: string) => string;
} {
  return {
    writeTempFile: (contents: string): string => {
      // A per-invocation private directory avoids name collisions under `par for`
      // fan-out; the 0600 file mode (pinned by contract, not caller-selected) keeps
      // the brief on-disk param exposure owner-only.
      const dir = mkdtempSync(join(tmpdir(), "pi-theta-params-")); // allow-sync: RFC-0006 one-shot params temp-file write, not event-loop I/O
      const path = join(dir, "params.json");
      writeFileSync(path, contents, { mode: SUBAGENT_PARAMS_TEMP_FILE_MODE }); // allow-sync: RFC-0006 one-shot params temp-file write
      return path;
    },
    unlink: (path: string): void => {
```

src/extension/production-subagent-host.ts:326-336 (the swallow lives in the seam):

```ts
    unlink: (path: string): void => {
      // Best-effort backstop delete; the child already deleted on read on the
      // normal path, so a missing file here is expected and non-fatal.
      try {
        unlinkSync(path); // allow-sync: RFC-0006 one-shot params temp-file cleanup
      } catch (unlinkError: unknown) { // allow-broad-catch: PIC-60 temp-file backstop — pi-integration-contract/subagent.md
        void unlinkError;
      }
    },
    readFile: (path: string): string => readFileSync(path, "utf8"), // allow-sync: RFC-0006 one-shot params temp-file read
  };
```

The runtime side sees only a two-member seam whose `writeTempFile` is opaque — src/runtime/subagent-params.ts:114-122:

```ts
export interface ParamsMarshalDeps {
  /**
   * Write `contents` to a fresh temp file and return its path (0600 channel).
   * The mode is fixed by contract (`SUBAGENT_PARAMS_TEMP_FILE_MODE`, owner-only)
   * — the implementation chooses it, not the caller.
   */
  readonly writeTempFile: (contents: string) => string;
  /** Delete the temp file (the parent-`finally` backstop). */
  readonly unlink: (path: string) => void;
}
```

and the child-side read deletes the FILE only — src/runtime/subagent-params.ts:244-249:

```ts
  const filePath = env[SUBAGENT_PARAMS_FILE_ENV];
  if (filePath !== undefined) {
    const contents = deps.readFile(filePath);
    deps.unlink(filePath);
    return parseParamsJson(contents);
  }
```

The three-member union is re-declared inline as the producer's construction input — src/extension/production-producer-deps.ts:226-230:

```ts
  readonly subagentParamsFs?: {
    readonly writeTempFile: (contents: string) => string;
    readonly unlink: (path: string) => void;
    readonly readFile: (path: string) => string;
  };
```

and adapted a second time in the spawn regime — src/extension/subagent-spawn-regime.ts:762-776:

```ts
    const fs = this.#input.subagentParamsFs;
    return {
      writeTempFile: (contents: string): string => {
        if (fs === undefined) {
          throw new SubagentSpawnFailedError(
            "subagent params temp-file channel unavailable: no params-fs seam wired",
          );
        }
        return fs.writeTempFile(contents);
      },
      unlink: (path: string): void => {
        fs?.unlink(path);
      },
    };
```

### Way B — thin primitive seam, policy in the runtime (RFC-0012 launch file)

src/extension/production-subagent-host.ts:259-283:

```ts
export function createProductionLaunchFileFs(): LaunchFileFs {
  return {
    mkdtemp: (prefix: string, mode: number): string => {
      const dir = mkdtempSync(join(tmpdir(), prefix)); // allow-sync: RFC-0012 one-shot launch-file directory creation, not event-loop I/O
      if (process.platform !== "win32") {
        chmodSync(dir, mode); // allow-sync: RFC-0012 one-shot launch-file directory mode pin
      }
      return dir;
    },
    writeFile: (path: string, contents: string, mode: number): void => {
      writeFileSync(path, contents, { mode }); // allow-sync: RFC-0012 one-shot launch-file write
    },
    readFile: (path: string): string => readFileSync(path, "utf8"), // allow-sync: RFC-0012 one-shot launch-file read at factory entry
    unlink: (path: string): void => {
      unlinkSync(path); // allow-sync: RFC-0012 one-shot launch-file delete
    },
    rmdir: (path: string): void => {
      rmdirSync(path); // allow-sync: RFC-0012 one-shot launch-file directory delete
    },
```

src/runtime/subagent-launch-file.ts:74-91 (the seven-primitive seam the runtime owns):

```ts
export interface LaunchFileFs {
  /** Create a fresh private directory (mode 0700) and return its path. */
  mkdtemp(prefix: string, mode: number): string;
  /** Write `contents` to `path` at `mode`. */
  writeFile(path: string, contents: string, mode: number): void;
  readFile(path: string): string;
  /** Delete the file; a failure is swallowed by the caller (best effort). */
  unlink(path: string): void;
  /** Remove the (now empty) private directory; best effort. */
  rmdir(path: string): void;
```

src/runtime/subagent-launch-file.ts:116-121 (prefix, file name and both modes are runtime policy):

```ts
export function writeLaunchFile(document: SubagentLaunchFileDocument, fs: LaunchFileFs): string {
  const dir = fs.mkdtemp("pi-theta-launch-", LAUNCH_FILE_DIR_MODE);
  const path = `${dir}/launch.json`;
  fs.writeFile(path, JSON.stringify(document), LAUNCH_FILE_MODE);
  return path;
}
```

src/runtime/subagent-launch-file.ts:128-139 (swallow AND directory removal are runtime policy):

```ts
export function deleteLaunchFile(path: string, fs: LaunchFileFs): void {
  try {
    fs.unlink(path);
  } catch (unlinkError: unknown) { // allow-broad-catch: RFC-0012 launch-file backstop delete — pi-integration-contract/subagent.md
    void unlinkError;
  }
  try {
    fs.rmdir(pathWin32.dirname(path));
  } catch (rmdirError: unknown) { // allow-broad-catch: RFC-0012 launch-file backstop delete — pi-integration-contract/subagent.md
    void rmdirError;
  }
}
```

src/runtime/subagent-launch-file.ts:43-46 — the launch file names the params file as its precedent:

```ts
/** Parent-private directory mode (owner-only). */
export const LAUNCH_FILE_DIR_MODE = 0o700;
/** Launch-file mode (owner-only), the PIC-60 params-file precedent. */
export const LAUNCH_FILE_MODE = 0o600;
```

docs/rfcs/0012-configurable-subagent-placement.md:1346-1347:

```
- PIC-60's 0600 temp-file params channel — the precedent for a parent-private
  file the child reads and deletes.
```

docs/spec_topics/pi-integration-contract/subagent.md:143 (PIC-60) describes the params temp-file mechanism as "built once for both directions".

### Counts, both ways

Search T1 — every `mkdtempSync` / `tmpdir()` use in `src/` (excluding comments and the import line):
`grep -rn "mkdtempSync\|tmpdir()" src --include=*.ts | grep -v "^\S*:\s*\*\|^\S*:\s*//\|import"` → 3 hits (one is the named-import member):

```
src/extension/production-subagent-host.ts:20:  mkdtempSync,
src/extension/production-subagent-host.ts:262:      const dir = mkdtempSync(join(tmpdir(), prefix)); // allow-sync: RFC-0012 one-shot launch-file directory creation, not event-loop I/O
src/extension/production-subagent-host.ts:321:      const dir = mkdtempSync(join(tmpdir(), "pi-theta-params-")); // allow-sync: RFC-0006 one-shot params temp-file write, not event-loop I/O
```
→ exactly two private-temp-directory creators in `src/`, one per way.

Search T2 — every `rmdir` in `src/` (excluding comments):
`grep -rn "rmdir" src --include=*.ts | grep -v "^\S*:\s*\*\|^\S*:\s*//\|import"` → 7 hits, ALL on the launch-file way:

```
src/extension/production-subagent-host.ts:22:  rmdirSync,
src/extension/production-subagent-host.ts:275:    rmdir: (path: string): void => {
src/extension/production-subagent-host.ts:276:      rmdirSync(path); // allow-sync: RFC-0012 one-shot launch-file directory delete
src/runtime/subagent-launch-file.ts:83:  rmdir(path: string): void;
src/runtime/subagent-launch-file.ts:135:    fs.rmdir(pathWin32.dirname(path));
src/runtime/subagent-launch-file.ts:136:  } catch (rmdirError: unknown) { // allow-broad-catch: RFC-0012 launch-file backstop delete — pi-integration-contract/subagent.md
src/runtime/subagent-launch-file.ts:137:    void rmdirError;
```
→ the `pi-theta-params-*` directory `createProductionParamsFs` creates has no remover in `src/`.

Search T3 — producers of the params directory prefix:
`grep -rn "pi-theta-params-" src tests --include=*.ts` → 7 hits; the single `src/` hit is production-subagent-host.ts:321 (the six `tests/` hits are fake paths / a test-owned `mkdtempSync` prefix):

```
src/extension/production-subagent-host.ts:321:      const dir = mkdtempSync(join(tmpdir(), "pi-theta-params-")); // allow-sync: RFC-0006 one-shot params temp-file write, not event-loop I/O
tests/helpers/fake-file-system.ts:325:        const path = `/tmp/pi-theta-params-${counter}.json`;
tests/subagent-child-env-scrub.test.ts:79:    [SUBAGENT_PARAMS_FILE_ENV]: "/tmp/pi-theta-params-stale/params.json",
tests/subagent-params-carrier.test.ts:168:    const stalePath = "/tmp/pi-theta-params-stale.json";
tests/subagent-params-carrier.test.ts:244:    const dir = mkdtempSync(join(tmpdir(), "pi-theta-params-carrier-"));
tests/subagent-params-marshalling.test.ts:158:    const path = join(tmpdir(), `pi-theta-params-perm-${process.pid}.json`);
tests/subagent-params-marshalling.test.ts:186:    const path = "/tmp/pi-theta-params-1.json";
```

Search T4 — consumers of the two production seam factories:
`grep -rn "createProductionParamsFs\|createProductionLaunchFileFs" src tests --include=*.ts | grep -v "^\S*:\s*\*\|^\S*:\s*//"` → 7 hits:

```
src/extension/production-composition.ts:62:  createProductionLaunchFileFs,
src/extension/production-composition.ts:63:  createProductionParamsFs,
src/extension/production-composition.ts:1313:    launchFs: createProductionLaunchFileFs(),
src/extension/production-composition.ts:1644:    subagentParamsFs: createProductionParamsFs(),
src/extension/production-subagent-host.ts:259:export function createProductionLaunchFileFs(): LaunchFileFs {
src/extension/production-subagent-host.ts:299:    launchFs: createProductionLaunchFileFs(),
src/extension/production-subagent-host.ts:311:export function createProductionParamsFs(): {
```
→ each factory has exactly one production consumer (composition root) and neither has a direct test (0 `tests/` hits); the policy baked into `createProductionParamsFs.writeTempFile` (prefix, `params.json`, no directory-mode pin, no directory removal) is therefore exercised only through the composed production path.

Search T5 — readers of `subagentParamsFs` (the inline three-member re-declaration):
`grep -rn "subagentParamsFs" src --include=*.ts | grep -v "^\s*//"` → 5 hits:

```
src/extension/production-composition.ts:1644:    subagentParamsFs: createProductionParamsFs(),
src/extension/production-producer-deps.ts:226:  readonly subagentParamsFs?: {
src/extension/subagent-spawn-regime.ts:762:    const fs = this.#input.subagentParamsFs;
src/extension/subagent-spawn-regime.ts:788:    const fs = this.#input.subagentParamsFs;
src/extension/subagent-spawn-regime.ts:1208:    const fs = this.#input.subagentParamsFs;
```

### The divergence already present
Same lifecycle step, different behaviour, because the policy lives in different layers:
- Directory removal: Way B's backstop (`deleteLaunchFile`, :134-138) removes the private directory; Way A's backstop (`unlink`, :326-334) and child-side read (`subagent-params.ts:247`) remove only `params.json`, leaving every `pi-theta-params-*` directory behind (Search T2: no `rmdir` on that way).
- Directory mode: Way B pins `LAUNCH_FILE_DIR_MODE` via `chmodSync(dir, mode)` on non-win32 (:263-265); Way A relies on `mkdtempSync`'s default (:321) with no pin.
- Ownership check: Way B's intake refuses a file another uid owns (`subagent-launch-file.ts:181-185`); Way A's seam exposes no `ownerUid` / `currentUid`, so no such check is expressible on the params channel.
- Swallow placement: Way A swallows the unlink error inside the production seam (:329-333); Way B swallows in the runtime (`deleteLaunchFile` :129-133) and keeps the production `unlink` primitive throwing (:272-274).

Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency plus the cost cited above — the repository's own RFC and constant docstring declare the params channel the precedent the launch file follows, the spec describes the temp-file mechanism as "built once", and the two production seams for it are shaped so differently that the later one's hardening (directory removal, directory-mode pin, ownership check) does not reach the earlier one.

## Why this is a problem
The same problem — a parent-private 0600 file in a fresh private directory that the child reads once and deletes, with a parent backstop — is solved by a fat seam whose policy is unreachable from the runtime and by a thin primitive seam whose policy is runtime-owned, both in one file, one declared the precedent of the other. A maintainer who hardens "the" child temp-file mechanism where the policy visibly lives (`runtime/subagent-launch-file.ts`) changes only the launch file; the params channel's equivalent decisions are inside `createProductionParamsFs.writeTempFile` and are not expressible through `ParamsMarshalDeps` at all (it has no `rmdir` / `ownerUid` / `mkdtemp`). The orphaned `pi-theta-params-*` directories and the missing directory-mode pin are the drift this split has already produced — the launch file got them at introduction (commit 4ae9b29c) while the params channel, introduced at 4866d4d2 and still shaped the same way, did not. The inline three-member re-declaration in `ProductionProducerInput` (a union the runtime never names) is the third place the params seam's shape is stated, so a member added to either runtime deps interface must be mirrored there by hand.

## Suggested direction (non-binding, optional)
Unification hypothesis (unproven): one primitive private-temp-file seam (the seven-member `LaunchFileFs` shape, or a narrowed subset of it) could back both channels, with the params channel's prefix / file name / mode / backstop-delete policy moved beside `marshalParams` / `readMarshalledParams` the way `writeLaunchFile` / `deleteLaunchFile` sit beside the launch-file document code; whether `ParamsMarshalDeps` / the intake deps can be re-expressed over that seam without disturbing the many test fakes that implement the current two-member shapes is for the fix stage to establish.

## False-positive check
- Clone-map check: the injected clone map lists no groups for `src/extension/production-subagent-host.ts`; no group covers this. The two factories are not token copies of each other (three members vs seven, policy inside vs outside), so this is mechanism-shaped, not D4's. (The token-identical `readFile: (path) => readFileSync(path, "utf8")` member shared by the two factories at :271 and :335 is a D4-shaped detail and is not the finding.)
- D9-affinity check: not a wrong-home claim — both factories legitimately live at the composition edge over `node:fs`; the finding is that the params-channel POLICY is placed in the seam while the launch-file policy is placed in the runtime, so the two channels cannot share hardening.
- D2-deadness check: both sides live — `createProductionParamsFs` is wired at production-composition.ts:1644 and read at subagent-spawn-regime.ts:762/788/1208; `createProductionLaunchFileFs` is wired at production-composition.ts:1313 and production-subagent-host.ts:299.
- D8 check: neither seam is over-built; the finding concerns their inconsistency, not their weight.
- Behaviour-change check: the orphaned-directory and mode-pin differences are cited as the demonstrated cost of the divergence; no bug is filed and no behaviour change is proposed here.
- Prior-filing check: the already-filed list contains PTQ-0907 (`real-fs-params-marshal-deps-duplicated`, a tests/ harness duplication), PTQ-1093 (`production-subagent-wire-request-param-unread`), PTQ-1202 (`subagent-launcher-seven-concerns`) and PTQ-1203 (`subagent-envelope-four-concerns`); none concerns the params-fs vs launch-file-fs seam shapes. `grep -rln "createProductionParamsFs\|createProductionLaunchFileFs" quality/issues quality/resolved quality/intake` → 4 prior hits (plus this file): quality/resolved/PTQ-0192-envelope-writer-redundant-forward.md, quality/resolved/PTQ-0194-parent-pid-depth-counter-mismatch.md, quality/resolved/PTQ-0196-params-fs-mode-param-constant.md, quality/resolved/PTQ-0199-subagent-host-header-two-collaborators-stale.md. PTQ-0196 (D2, fixed) removed the then-caller-supplied `mode` parameter from `writeTempFile` and pinned it inside the seam (`ParamsMarshalDeps` docstring: "the implementation chooses it, not the caller") — a vestigial-parameter fix whose scope was that one parameter; it did not assess the seam's shape against the launch-file seam (PTQ-0196 is dated 2026-09-11; the launch-file seam landed on 2026-09-15 in 4ae9b29c) and does not cover this site. PTQ-0192 (envelope writer identity forward), PTQ-0194 (parent-pid vs depth counter) and PTQ-0199 (stale header roster) touch other members of the same file.
- Git-intent check: `git log --oneline -S'pi-theta-params-' -- src` → 4866d4d2 (RFC 0006, v0.9.0) introduced the params seam; `git log --oneline -S'pi-theta-launch-' -- src` → 4ae9b29c (RFC 0012 step 2) introduced the launch-file seam with "0700 dir / 0600 file" in its subject; no commit records a decision that the two channels must differ in directory cleanup or mode pinning.
- Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency plus the cost cited above.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. Both ways were checked at the cited lines: createProductionParamsFs at production-subagent-host.ts:311-337 (a fat 3-member seam with the swallow inside it) and createProductionLaunchFileFs at :259-283 (7 primitives, with the policy in subagent-launch-file.ts writeLaunchFile/deleteLaunchFile at :116-139). Searches T1-T5 reproduce line for line. clone-scan finds no groups for the host. The cost is concrete: 4ae9b29c introduced the launch-file rmdir, while the params channel's mkdtempSync directory is never removed, since neither the child read (subagent-params.ts:247) nor the backstop unlinks anything but params.json. The mode-pin cost is weak because mkdtempSync already creates 0700, and the ownership-check cost is speculative. Not a duplicate: PTQ-1548 covers marshal-failure routing, which is a different root cause (triage: claude-opus-5-5)
