---
id: PTQ-0114
title: Three narration sites in theta-composition-producer.ts describe subagent-mode as spawning an isolated in-process AgentSession, a drive RFC-0005 replaced with a child pi process
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/theta-composition-producer.ts:14-17
  - src/extension/theta-composition-producer.ts:341-344
  - src/extension/theta-composition-producer.ts:413-416
  - src/extension/theta-composition-producer.ts:251-261
sites: 3
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Three narration sites in theta-composition-producer.ts describe subagent-mode as spawning an isolated in-process AgentSession, a drive RFC-0005 replaced with a child pi process

## Observation
Three comments in `theta-composition-producer.ts` state that subagent-mode
dispatch spawns an isolated `AgentSession` and binds the executor to that
in-process private session: the module header's mode-routing bullet, the
`ThetaProducerDeps.spawnSubagentConversation` doc, and step 2 of
`composeThetaFixture`'s numbered contract. RFC-0005 / RFC-0006 replaced that
drive with a spawned child `pi` process: the production
`spawnSubagentConversation` launches a child process and the parent awaits a
`theta_result` envelope, which the same file's `ConversationBinding.drive`
field doc describes. No file under `src/` references `createAgentSession` — the
SDK entry point for creating an `AgentSession` — outside comments recording its
retirement.

## Evidence
src/extension/theta-composition-producer.ts:14-17 — the module header's
mode-routing bullet:

```ts
//   - it routes on the theta's `mode:` and drives `V19d`'s effectful executor
//     (`executeBody`) against the appropriate conversation: prompt-mode against
//     the user session via the `V12a`/`V9c` prompt driver, subagent-mode against
//     a freshly spawned isolated `AgentSession` via `V9i`'s spawn seam; and
```

src/extension/theta-composition-producer.ts:341-344 — the seam method's doc:

```ts
  /**
   * Subagent-mode (`V9i`): spawn an isolated `AgentSession` and bind `V19d`'s
   * executor to that private session rather than the user conversation.
   */
```

src/extension/theta-composition-producer.ts:413-416 — step 2 of the numbered
contract on `composeThetaFixture`:

```ts
 *   2. route on `theta.frontmatter.mode` — prompt-mode binds `V19d`'s executor
 *      to the user session (`V12a`/`V9c`), subagent-mode spawns an isolated
 *      `AgentSession` and binds the executor to that private session (`V9i`);
 *   3. drive `executeBody(theta.body, binding.executeDeps)` against the bound
```

src/extension/theta-composition-producer.ts:251-261 — the same file's
`drive` field doc, describing the drive that actually runs:

```ts
  /**
   * RFC-0006 (PIC-59): a fully self-contained drive that resolves the
   * invocation's `Result` WITHOUT the drive seam running `executeBody` against
   * `executeDeps`. Present on the parent-side subagent-mode binding, whose body
   * runs in a spawned child `pi` process (the parent only launches, awaits the
   * `theta_result` envelope, and maps `ok`/`err`); when present the drive seam
   * calls `drive()` instead of `executeBody(theta.body, executeDeps) + surface`.
   * Absent for prompt-mode / child-side in-process bindings (the drive seam runs
   * the body directly).
   */
  readonly drive?: () => Promise<ResultValue>;
```

## Why this is a problem
Historical narration: the three claims describe the pre-RFC-0005 in-process
subagent drive. `git blame` dates all three to 2026-07-02 (`e83b900ce` /
`a1971bc8c`, then carried through the loom→theta rename `2bc691576`), while the
child-process rework landed 2026-07-24 (`fda23a4b` "feat: child-process
subagent sessions (RFC 0005) — v0.8.0"). The file now carries two
irreconcilable descriptions of the same dispatch: the header/step-2/seam-doc
in-process `AgentSession`, and the `drive` field doc's "spawned child `pi`
process (the parent only launches, awaits the `theta_result` envelope)".
`createAgentSession` — the API those three sites name a spawn of — appears in
no `src/` code at all, only in comments recording its retirement
(sdk-inventory.ts:209-215: "`createAgentSession` and the former in-process
subagent satellites … have LEFT the inventory entirely … the subagent drive
spawns a child `pi` process and no `src/**` file imports them").

## Suggested direction (non-binding, optional)
Bring the three subagent-mode descriptions into line with the drive the file
already documents on `ConversationBinding.drive`, or point them at that field
instead of re-describing the mechanism.

## False-positive check
- Verified the production implementation: `spawnSubagentConversation` in
  src/extension/production-theta-producer.ts:2257 runs the PIC-62 pre-spawn
  model guard and resolves through a child-launch `drive()`
  (:2997 "`spawnSubagentConversation` launches as a fresh child `pi` process");
  the parent never constructs an `AgentSession`.
- `grep -rn "createAgentSession" src tests --include=*.ts` → 9 hits, all inside
  comments stating the retirement (capability-probe.ts:14/56/335/464,
  production-theta-producer.ts:30, sdk-inventory.ts:12/162/192/209) plus one
  test comment; zero call sites, zero imports.
- `grep -rn "AgentSession" src/extension/theta-composition-producer.ts` → the
  three cited comment lines only (17, 342, 415); no type import, so nothing in
  the file references the SDK type it names.
- Not dead code: all three comments annotate live declarations
  (`composeThetaFixture`, `ThetaProducerDeps.spawnSubagentConversation`), which
  production drives; this is narration drift, not unreachable code.
- Duplicate check: `grep -rln "AgentSession" quality/intake` matched
  qw20260907130901-d2-04-rfc0005-theta-adapter-satellites-dead.md (dead
  declarations in production-theta-producer.ts) and
  qw20260907183353-d2-07-extension-modules-stub-narration-stale.md (the
  `V19e-T` stub sentence at :27-35) — neither cites any of the three sites here.
- Neighbouring candidate checked: the same stale phrase also sits in
  src/extension/production-theta-producer.ts:10 (outside this shard's file set),
  and a sibling candidate filed in this wave —
  qw20260907202646-d2-05-module-header-three-collaborators-agentsession.md —
  takes that file's own header as its root cause (its locations are
  production-theta-producer.ts:1-15/:29-32/:2241-2249 plus the
  `ThetaProducerDeps` span theta-composition-producer.ts:318-400 quoted for its
  member count). The three narration sites cited here are this file's own and
  are not among that candidate's cited claims.

## Triage
verdict: confirmed — all three excerpts are verbatim at :14-17/:341-344/:413-416 (blame e83b900ce/a1971bc8c/2bc691576, 2026-07-02..07-19) and the contradicting drive doc at :251-261 is 4866d4d2c (2026-07-24, the fda23a4b child-process RFC-0005/0006 rework), so the narration provably predates the mechanism it describes; production spawnSubagentConversation (production-theta-producer.ts:2257) runs the PIC-62 guard then launchSubagentChild (:2585) and resolves via drive(), never constructing a session nor running executeBody in-parent, and the only in-process subagent path (subagent fn, :3023/:3076) uses an off-session #resolvePromptQuery conversation rather than an AgentSession; grep AgentSession in this file returns exactly lines 17/342/415 with no import, and no src/ file references createAgentSession outside retirement comments; historical narration comments are explicitly in the D2 hunt list, and no filed candidate covers these lines (sibling d2-05's root cause is production-theta-producer.ts:1-15's own header/roster, qw20260907183353-d2-07 cites :27-35, d2-01-registry cites :335-338); one non-refuting imprecision recorded: the FP-check's "zero call sites, zero imports" holds for src/ but is wrong for tests — tests/live/harness.ts:25/:239 and tests/live/hardening/probe-harness.ts:47/:320 import and call createAgentSession to build the live harness's own user session, which is not the subagent drive (triage: claude-opus-5)
