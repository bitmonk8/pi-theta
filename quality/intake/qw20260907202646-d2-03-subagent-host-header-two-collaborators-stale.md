---
id: pending
title: production-subagent-host.ts's header states the module owns two production collaborators and enumerates its ambient reads, while the composition root imports six collaborators and the module reads more ambient primitives than listed
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/production-subagent-host.ts:1-19
  - src/extension/production-composition.ts:58-65
  - src/extension/production-subagent-host.ts:189-194
  - src/extension/production-subagent-host.ts:215-218
  - src/extension/production-subagent-host.ts:220-226
  - src/extension/production-subagent-host.ts:276-287
sites: 6
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# production-subagent-host.ts's header states the module owns two production collaborators and enumerates its ambient reads, while the composition root imports six collaborators and the module reads more ambient primitives than listed

## Observation
The module header of `production-subagent-host.ts` opens with a closed
inventory: "This module owns the two production collaborators the subagent
launcher seam … consumes against the real OS", naming the `ExecutableHost`
snapshot and the `SpawnFn`. The composition root imports six names from this
module. Two of the six (`createProductionParamsFs`,
`createProductionEnvelopeWriter`) are labelled RFC-0006 in their own
doc-comments, while the header is titled and framed RFC-0005. The header's
second paragraph enumerates the ambient reads "localised here" as
`process.execPath` / `process.argv` / `process.platform`,
`child_process.spawn`, and `node:fs` existence; the module additionally reads
`process.ppid`, `process.pid`, `os.tmpdir()`, and performs `node:fs`
mkdtemp/write/read/unlink plus a raw fd-1 `writeSync`.

## Evidence
src/extension/production-subagent-host.ts:1-19 — the header's two claims:

```ts
// RFC-0005 — production child-process host for the subagent drive.
//
// This module owns the two production collaborators the subagent launcher seam
// (`src/runtime/subagent-launcher.ts`) consumes against the real OS: the
// `ExecutableHost` snapshot the executable-resolution ladder reads
// (pi-integration-contract/subagent.md #subagent-executable-resolution) and a
// Windows-safe `SpawnFn` that spawns the child `pi` process with `child_process.
```

```ts
// The ambient reads localised here (`process.execPath` / `process.argv` /
// `process.platform`, `child_process.spawn`, `node:fs` existence) are NOT on the
// banned-primitive list (`process.env` / `process.cwd` / timers / `Date` are);
// the one `process.env` read (full-environment inheritance is the RFC-0005
// credential mechanism) carries a same-line `allow-ambient` exemption.
```

src/extension/production-composition.ts:58-65 — the composition root's import
from this module, six names:

```ts
import {
  createProductionEnvelopeWriter,
  createProductionExecutableHost,
  createProductionParamsFs,
  createProductionSpawnFn,
  readParentEnv,
  readParentPid,
} from "./production-subagent-host";
```

Two of those six feed the launcher seam the header scopes itself to —
`src/runtime/subagent-launcher.ts:487-488` takes `parentEnv` / `parentPid`
parameters, supplied at `production-composition.ts:885-886` from
`readParentEnv()` / `readParentPid()`.

src/extension/production-subagent-host.ts:189-194 and :215-218 — ambient reads
the header's enumeration omits:

```ts
export function readParentEnv(): Readonly<Record<string, string | undefined>> {
  return authenticateControlPlane(
    process.env, // allow-ambient: process.env — RFC-0005 subagent full-env inheritance
    process.ppid, // allow-ambient: process.ppid — the control-plane carriage check
  );
}
```

```ts
/** The parent process id carried to the child (orphan-prevention watchdog / depth counter). */
export function readParentPid(): number {
  return process.pid;
}
```

src/extension/production-subagent-host.ts:220-226 — the RFC-0006 params-fs
collaborator, whose `node:fs` use is mkdtemp/write, not existence:

```ts
/**
 * RFC-0006 (PIC-60). The production params-channel filesystem seam. `writeTempFile`
 * writes the canonical params JSON to a fresh 0600 temp file (owner-only) in a
 * private temp directory and returns its path; `unlink` deletes it (the parent's
 * `finally` backstop); `readFile` is the child-side read of the marshalled path.
 * Windows-safe: `mkdtempSync` + `writeFileSync` with an explicit `mode`, no shell.
 */
```

src/extension/production-subagent-host.ts:276-287 — the RFC-0006 envelope
writer, a raw fd-1 write:

```ts
export function createProductionEnvelopeWriter(
  writeToFd: (line: string) => void = defaultStdoutFdWrite,
): (line: string) => void {
  return (line: string): void => {
    writeToFd(line);
  };
}

/** The default fd-1 envelope write (see `createProductionEnvelopeWriter`'s WHY). */
function defaultStdoutFdWrite(line: string): void {
  writeSync(1, line); // allow-sync: RFC-0006 one-shot return-envelope write to fd 1, not event-loop I/O
}
```

## Why this is a problem
The header is a closed inventory ("the two production collaborators", "the
ambient reads localised here (…)"), and both halves undercount the module they
describe. The ambient-read list is load-bearing for this repo's
no-ambient-primitives convention — it is the module's own statement of which
gated primitives it touches and why each is admissible — so an enumeration that
omits `process.ppid`, `process.pid`, `os.tmpdir()`, and the fs write/unlink
surface no longer discharges that purpose. `git blame` dates the header to
2026-07-24 (`fda23a4b6`); `createProductionParamsFs` landed the same day in a
later commit (`4866d4d2c`), `createProductionEnvelopeWriter` on 2026-07-25
(`22306e5d4`), and `authenticateControlPlane` (which introduced the
`process.ppid` read) on 2026-08-13 (`7f360d208`) — the header was not revisited
as the module grew from the RFC-0005 launch pair to the current six exports.

## Suggested direction (non-binding, optional)
Restate the header's inventory over what the module exports today, or drop the
closed counts and the ambient-read enumeration in favour of the per-function
doc-comments that already carry them.

## False-positive check
- Import roster: read `src/extension/production-composition.ts:58-65` directly;
  six named imports, all reached in production (`createProductionSpawnFn` at
  :883, `createProductionExecutableHost` at :583, `readParentEnv` at
  :641/:650/:885/:922/:1411, `readParentPid` at :886,
  `createProductionParamsFs` at :889, `createProductionEnvelopeWriter` at
  :813).
- Launcher-seam scope check: confirmed the header's own narrowing ("the
  subagent launcher seam consumes") still undercounts —
  `src/runtime/subagent-launcher.ts:487-488,616-617` consume `parentEnv` and
  `parentPid`, sourced from this module.
- Ambient-read audit: `grep -n "process\.\|tmpdir\|writeSync\|mkdtempSync\|
  writeFileSync\|unlinkSync\|readFileSync" src/extension/production-subagent-host.ts`
  — hits include `process.env`, `process.ppid`, `process.pid`,
  `process.execPath`, `process.argv`, `process.platform`, `tmpdir()`,
  `mkdtempSync`, `writeFileSync`, `unlinkSync`, `readFileSync`, `writeSync`,
  `existsSync`.
- Not a deadness claim: every export cited is reached from production; this is
  a header-inventory mismatch, not unreachable code. No test-only-reachable
  code is being reported as dead.
- History intent: `git blame -L 1,10` → `fda23a4b6` (2026-07-24) for the header;
  `git blame` on lines 201/227/276 → `7f360d208` (2026-08-13), `4866d4d2c`
  (2026-07-24), `22306e5d4` (2026-07-25) for the later collaborators.

## Triage
verdict: questionable — header does omit the two RFC-0006 collaborators the module owns (verified, as are all excerpts/line cites), but the ambient half is refuted (ppid/pid/tmpdir/fs are ungated by tools/arch-checks/no-ambient-primitives.js, which reports zero non-exempt refs here, and `process.pid` shipped in the header's own commit fda23a4b6), the header WAS revised after both RFC-0006 landings (21937ef5b, 2026-07-25), and "the two collaborators the launcher seam consumes" is defensible as scoped — a human should rule (triage: claude-opus-5)
verdict: questionable — re-verified independently: all six excerpts and the six-name import reproduce (composition cites drifted uniformly +17–36 lines, every usage present; :286 excerpt drops the token "PIC-59"), and the header genuinely never mentions the two RFC-0006 seams the module has owned since 4866d4d2c/22306e5d4, but the anchor is taste, not mechanics — "the two collaborators the launcher seam consumes" is literally true (subagent-launcher.ts consumes only ExecutableHost + SpawnFn from this module; params-fs is consumed by subagent-params.ts via the producer and the envelope writer by producer/composition, neither by the launcher; readParentEnv/readParentPid already coexisted with "two" in fda23a4b6), the ambient half is refuted (tools/arch-checks/no-ambient-primitives.js bans only process.env/cwd, crypto.randomUUID, Date.now/performance.now/getTime, setTimeout/clearTimeout; findAmbientPrimitiveReferences returns [] for this file; "the one process.env read" is still exactly one at :191; process.pid shipped in fda23a4b6 alongside the header, so its omission is original, not drift), and the "not revisited" narrative is wrong (21937ef5b, 2026-07-25, edited header lines 8-13 after both RFC-0006 landings and kept "two") — a human should rule whether an incomplete-but-accurate inventory warrants a fix (triage: claude-opus-5)
verdict: questionable — a third independent pass concurs: I ran `findAmbientPrimitiveReferences` myself against the live file and it returns `[]` (only process.env/cwd, crypto.randomUUID, Date.now/performance.now/getTime, setTimeout/clearTimeout are gated), confirming the ambient-half anchor is false; `createProductionParamsFs`/`createProductionEnvelopeWriter` feed production-theta-producer.ts, never subagent-launcher.ts, so the header's own scoping clause correctly excludes them and "six imports" overstates the gap; subagent-launcher.ts:569 itself titles only `{spawn, emitDiagnostic}` "the launcher's collaborators" and parks `host`/`parentEnv`/`parentPid` in the separate `SubagentLaunchRequest` data bundle — the same collaborator-vs-data split the header draws; git confirms fda23a4b6 shipped 4 exports (incl. a bare `process.pid` read) on day one under "two", and 21937ef5b re-touched this exact paragraph on 2026-07-25 (a day after both RFC-0006 collaborators landed together in 4866d4d2c, which the candidate misdates by splitting across 4866d4d2c/22306e5d4) without adopting the growth, so "not revisited" is wrong, not merely imprecise; what survives is only that the file's own "RFC-0005" tag never flags the two RFC-0006 collaborators it also owns, which is real but a documentation-taste question given each carries its own correctly RFC-tagged doc-comment — a human should rule (triage: claude-opus-5)
verdict: questionable — fourth independent pass, same result: `git show fda23a4b6:src/extension/production-subagent-host.ts` shows the header's "two collaborators" line shipped alongside FOUR exports (createProductionExecutableHost, readParentEnv, readParentPid, createProductionSpawnFn) with a bare `process.pid` read already outside the ambient enumeration on day one, so the omission is the header's original scope, not accumulated drift, and `21937ef5b` edited this exact paragraph the next day (after 4866d4d2c had already added both RFC-0006 exports together — that commit, not `22306e5d4` as the candidate's history section states, is where `createProductionEnvelopeWriter` was introduced; `22306e5d4` only swapped its body to fd-1 `writeSync`) without revising "two", so the framing reads as a deliberate collaborator/data split (subagent-launcher.ts's own `SubagentLaunchDeps`, ":569 \"the launcher's collaborators\"", vs. its `SubagentLaunchRequest` data bundle) rather than neglect; independently re-ran `findAmbientPrimitiveReferences` against the live file myself (`[]`) and confirmed the ban list in tools/arch-checks/no-ambient-primitives.js and its repo-wide enforcement test (di-seam-skeleton.test.ts) cover only env/cwd/randomUUID/Date.now/performance.now/getTime/setTimeout/clearTimeout, so pid/ppid/tmpdir/fs-sync are never gated and the "load-bearing" claim is false; what remains true and unrebutted is only that the RFC-0005-tagged banner never names the two RFC-0006 exports the file also carries, each already self-tagged in its own doc-comment — a real fact but a documentation-taste call, not a mechanically-provable defect (triage: claude-opus-5)
verdict: questionable — fifth independent pass, concurring but sharpening the prior rounds' own defense: I re-ran `findAmbientPrimitiveReferences` myself ([] for this file; the tool's MEMBER_RULES/BARE_IDENTIFIERS only gate env/cwd/randomUUID/Date.now/performance.now/getTime/setTimeout/clearTimeout), so the "load-bearing for the no-ambient-primitives convention" anchor is false, full stop — pid/ppid/tmpdir/fs-sync were never in that convention's scope, not merely omitted from it; but the "collaborator vs data" rebuttal used in rounds 2-4 ("subagent-launcher.ts consumes only ExecutableHost + SpawnFn from this module") does not fully hold either — `launchSubagentChild`'s own body reads `request.parentEnv` (subagent-launcher.ts:602) and `request.parentEnv`/`request.parentPid` (:616-617) exactly as it reads `request.host` (:592,611), so by the header's own stated scope ("the launcher seam ... consumes") the undercount is real even setting the RFC-0006 pair aside — which cuts toward the candidate on this narrow point without rescuing its false ambient anchor; net effect unchanged from the prior four passes: a real, narrow documentation-completeness gap bundled with one demonstrably false claim, taste/scope territory a human should rule on (triage: claude-opus-5)
