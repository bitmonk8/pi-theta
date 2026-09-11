---
id: PTQ-0203
title: factory.ts's two prose rosters of factory-time host-binding calls both omit pi.registerTool
lens: D2                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/factory.ts:17-19
  - src/extension/factory.ts:130-143
  - src/extension/factory.ts:629-643
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911104855
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# factory.ts's two prose rosters of factory-time host-binding calls both omit pi.registerTool

## Observation
`factory.ts` carries two enumerative comments that each list the closed set of
`pi.*` calls the factory issues synchronously (outside any handler): the
module header's "Factory-body calls" sentence, and the `BootstrapCapability`
type's doc comment naming the "closed set of host-binding capabilities" the
`theta/load/extension-bootstrap-failed` diagnostic can carry. Both rosters
enumerate five calls; the file has six. `pi.registerTool` — a real,
synchronous, factory-body, non-abort-on-throw call added by RFC-0010 — is
absent from both.

## Evidence
src/extension/factory.ts:17-19 — the header's roster (two direct calls + three
`pi.on` subscriptions = five; the actual synchronous body issues six):
```ts
// Factory-body calls (the synchronous-arm registrations): `pi.registerFlag`,
// `pi.registerMessageRenderer`, and the three factory-time `pi.on`
// subscriptions (`resources_discover`, `session_start`, `session_shutdown`).
```

src/extension/factory.ts:130-143 — the `BootstrapCapability` doc names "two"
abort surfaces plus "three" non-abort surfaces (five total), while the type
it documents has six members:
```ts
/**
 * The closed set of host-binding capabilities a `theta/load/extension-bootstrap-failed`
 * diagnostic can name (code-registry-load.md). The two whole-extension abort
 * surfaces (`pi.registerFlag`, `pi.on`) are owned by `V9k`; the three non-abort
 * surfaces (`pi.registerMessageRenderer`, `pi.registerCommand`,
 * `pi.getCommands`) are owned by `V9p`.
 */
type BootstrapCapability =
  | "pi.registerFlag"
  | "pi.on"
  | "pi.registerMessageRenderer"
  | "pi.registerCommand"
  | "pi.getCommands"
  | "pi.registerTool";
```

src/extension/factory.ts:629-643 — the sixth member is a live, ordinary
factory-body call named nowhere in either roster: a `typeof`-guarded,
per-call-`try`/`catch` registration in the factory's synchronous body, whose
throw arm does not abort the factory (a non-abort surface, like
`registerMessageRenderer`/`registerCommand`/`getCommands`):
```ts
    if (typeof pi.registerTool === "function") {
      try {
        registerThetaProgressTool(pi, {
          isChildRegime: deps.isSubagentChild === true,
          bus: () => liveStatusBus,
          invocations: () => liveActiveInvocations,
          clock: () => liveClock,
          entryChannel,
        });
      } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
        deps.emitDiagnostic?.(
          bootstrapFailedDiagnostic("pi.registerTool", e, { theta: THETA_PROGRESS_TOOL_NAME }),
        );
      }
    }
```

Pattern check: `grep -n "bootstrapFailedDiagnostic(" src/extension/factory.ts`
shows all six `BootstrapCapability` literals actually passed as arguments —
`"pi.registerFlag"` (:585), `"pi.registerMessageRenderer"` (:601),
`"pi.registerTool"` (:640), `"pi.on"` (:662, :728, :1149, :1321/:1328),
`"pi.getCommands"` (:751), `"pi.registerCommand"` (:766, :801) — so the type
itself is fully live; only the two prose counts are short.

## Why this is a problem
Both comments are collaborator/call-site rosters, not free prose: each states
a closed count ("two … three", a six-member union) that a reader relies on to
know every `pi.*` surface the factory touches synchronously and every
capability name a bootstrap diagnostic can carry. `git log -p -L128,144` shows
the RFC-0010 commit (`1f45d6546a`, "L3 — theta_progress tool") appended
`| "pi.registerTool"` to the `BootstrapCapability` union without touching the
five-name doc comment above it, which is otherwise unchanged since `V9k`
authored it (`37b0098e`, Jul 2026). `git log -p -L17,20` shows the header's
"Factory-body calls" sentence has been byte-identical since the file's first
commit (`9cb58144`, Jun 30 2026), two months before `pi.registerTool` existed,
and was never revisited when it landed. Both rosters now under-count the
file's own closed sets by one.

## Suggested direction (non-binding, optional)
Add `pi.registerTool` to both enumerations (header: a fourth factory-body
call; `BootstrapCapability` doc: a fourth non-abort surface) so the prose
counts match the type and the header's call list again.

## False-positive check
- Counted the `BootstrapCapability` union's members directly in source
  (:137-143): six literals.
- `grep -n "bootstrapFailedDiagnostic(" src/extension/factory.ts` (reproduced
  above): every one of the six literals is passed as a real first argument at
  a real call site, so the sixth member is live code, not a stray type entry.
- `grep -n "pi\.on(" src/extension/factory.ts`: exactly three subscription
  call sites (`resources_discover` :659, `session_start` :673,
  `session_shutdown` :1172), matching the header's "three factory-time `pi.on`
  subscriptions" clause — that part of the header is accurate; only the
  direct-call half of its roster is short.
- `git log -p -L17,20:src/extension/factory.ts` and
  `git log -p -L128,144:src/extension/factory.ts`: the header sentence is
  unchanged since file creation; the `BootstrapCapability` doc is unchanged
  since `V9p` (`37b0098e`) while the union itself was extended by the later
  RFC-0010 commit `1f45d6546a` — confirming the prose predates the sixth
  member rather than describing it deliberately.
- Confirmed this is not the same claim as the already-resolved
  `PTQ-0098-factory-header-scope-narration-stale.md` (which concerned the
  header's diagnostic-ownership attribution, `V9a` vs `V9k`, at :22-25 in its
  own line numbering) or `PTQ-0163` (an unrelated `deps.registry` field) —
  neither cites the "Factory-body calls" roster or the `BootstrapCapability`
  member count.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both excerpts reproduce verbatim at cited lines (header :17-19, BootstrapCapability doc+type :130-143), grep confirms all six literals including "pi.registerTool" (:640) are live bootstrapFailedDiagnostic args and only three pi.on sites exist (matching the header's accurate clause), and `git log -p -L128,144` shows commit 1f45d6546a appended the union member without touching either five-item prose count; not PTQ-0098 (V9a/V9k attribution) or PTQ-0163 (deps.registry), which cite unrelated claims (triage: claude-opus-5)
