# Bug 0330 — an `as`-renamed `.theta` callable draws `theta/runtime/subagent-callable-hash-mismatch` on every launch of its caller, edits or none: the parent marshals the hash under the presented (post-rename) name while the child re-derives names from file basenames only, so the child can never locate the renamed callable's sources and refuses it as `<child source unavailable>` on a byte-identical workspace

- **Status:** open.
- **Sev/Diff estimate:** S3/D2 — S3 on two counts that offset: the loud
  half is a diagnostic that lies (a tamper/divergence-shaped error,
  registry-pinned message "content hash mismatch; refusing invocation", on
  a workspace where nothing changed — burning trust in the one signal the
  hash contract emits), and the silent half is that verification is
  structurally ABSENT for every renamed entry (a real edit to the renamed
  callee produces the identical unavailable-shaped refusal-that-drops-
  nothing, so the rename class is permanently outside the tamper check).
  Per bug 0329 the refusal enforces nothing today, which caps
  severity at diagnosed-noise — but any fix to 02 (fail the root on
  refusal) instantly converts this false positive into "every subagent
  theta with a renamed `.theta` callable refuses on every launch", i.e.
  S1-adjacent; the two must be fixed together. D2 because either side can
  carry the fix: marshal under the child-derivable name, or teach the
  child's name derivation the caller's `tools:` rename table (it parses
  the marked root's own frontmatter anyway).
- **Kind:** defect — two halves of one contract disagree on the map's key
  space; the child half even documents the disagreement as intended
  behaviour ("a deleted / moved / `as`-renamed callee the child cannot
  re-resolve" — `subagent-child-hash-verify.ts` doc comment), treating an
  ordinary, load-legal rename as equivalent to deletion.
- **Related:**
  - [0329](./0329-hash-mismatch-refusal-does-not-refuse-invocation.md) — why the spurious refusal currently
    drops nothing; the interaction inverts on 02's fix.
  - [0328](./0328-root-callee-closure-hash-never-marshalled.md) — the other key-space gap in the same
    map (root absent).
  - 0218 (fixed) — established that a `.theta` callable's presented name
    is theta-side and rides this carrier; this report is that carrier's
    key not being child-resolvable.
- **Affected** (at ee681f7b, v0.287.0):
  - `src/extension/production-theta-producer.ts:2066` — map keyed by
    `entry.presentedName` (post-`as`, post-hyphen→underscore).
  - `src/extension/production-composition.ts:1144–1146`
    (`deriveCallableName`) — child-side alignment key: basename minus
    `.theta`, hyphens→underscores; no rename table consulted.
  - `src/extension/production-composition.ts:1186` — `byName` built from
    discovered thetas via that derivation; a presented name that is not a
    file-derived name maps to no sources.
  - `src/runtime/subagent-child-hash-verify.ts` `verifyOne` (by symbol) —
    `sources === undefined` → fail-closed refusal, hint
    `observed <child source unavailable>`.
- **Observed at:** v0.287.0 (ee681f7b), offline — deterministic vitest
  probes (deleted after confirmation; recipe below), both directions:
  parent-side marshalling under the renamed key via the real
  `spawnSubagentConversation` over the fake launcher, child-side spurious
  refusal via `discoverAndComposeFixtures` with authenticated env.

## Summary

The launch contract marshals each `.theta` callable as "the presented name
+ marshalled closure hash" (subagent.md launch-contract table), and the
parent does exactly that: `{"zqx_renamed": "sha256:…"}` for
`tools: [./zqx-tool.theta as zqx_renamed]`. The child's verification pass
aligns marshalled keys with discovered thetas by `deriveCallableName`
(basename, hyphen→underscore). `zqx_renamed` is not any file's basename,
so the discovery view answers `undefined`, `verifyOne` refuses fail-closed,
and the pinned mismatch message fires — with the CORRECT hash in hand and
byte-identical sources on disk. The rename is a first-class `tools:`
grammar production (the Gap-2 lineage explicitly preserves "the
hyphen→underscore + `as` rewrites" on the frozen entry so renamed callees
stay dispatchable), so this is an ordinary configuration, not an edge.

## Reproduction

Offline, deterministic. Workspace:

```
.pi/theta/zqx-caller.theta  ---\nmode: subagent\ntools:\n  - ./zqx-tool.theta as zqx_renamed\n---\nlet r = zqx_renamed("hi")\n@`use ${r}`
.pi/theta/zqx-tool.theta    ---\nmode: subagent\nparams:\n  q: string\n---\n@`tool body ${q}`
```

1. Parent-side (fake-launcher bind of `zqx-caller` with the frozen entry
   `presentedName: "zqx_renamed"`, `closureHash: "sha256:RENAMED-LOADTIME"`):
   recorded spawn env carries
   `PI_THETA_SUBAGENT_CALLABLE_HASHES={"zqx_renamed":"sha256:RENAMED-LOADTIME"}`.
2. Child-side: env `PI_THETA_SUBAGENT_PARENT_PID=<ppid>`,
   `PI_THETA_SUBAGENT_ROOT=zqx-caller`, carrier
   `{"zqx_renamed": <correct hashCallableClosure of the on-disk tool>}`.
   `discoverAndComposeFixtures` emits:

   ```
   theta/runtime/subagent-callable-hash-mismatch: subagent callable
   'zqx_renamed' content hash mismatch; refusing invocation
     hint: expected sha256:874f04…, observed <child source unavailable>
   ```

   and registers BOTH `zqx-caller` and `zqx-tool` (nothing dropped — the
   refusal has no theta to drop; the invocation proceeds).

## Expected behaviour

subagent.md `#subagent-theta-callable-hash`: the marshalled name is
"resolved child-side by name against the child's own theta registry, plus
content-hash verification". The child's registry resolution for dispatch
DOES know the rename — the marked root's own `tools:` is parsed and its
callable set frozen with `presentedName → calleePath` in the same compose
pass — so a matching hash for a renamed callable must verify and admit,
and only a real divergence may draw the mismatch code. A diagnostic whose
registered meaning is content divergence firing on identical content is a
category-(4) wrong-signal defect on its own.

## Actual behaviour / root cause

Name alignment (`byName`, `production-composition.ts:1180–1197`) is
file-derivation-only: it never consults the marked root's callable-set
snapshot, where the rename table lives. The doc comment on
`ChildClosureDiscovery` classifies "`as`-renamed" with "deleted / moved" —
a design note that bakes the false positive in.

## Why it matters

- Every launch of every subagent theta using a rename emits a
  tamper-shaped error into the child's diagnostics; operators triaging
  real hash mismatches (0312's staleness class) cannot distinguish signal
  from this permanent noise.
- The rename class silently loses the protection entirely: an actual edit
  to the renamed callee yields the same unavailable-shaped refusal it
  yields with no edit — the hash never gets compared at all.
- Fix coupling: bug 0329's obvious fix (any refusal fails the root)
  turns this from noise into a hard regression — every renamed-callable
  theta becomes unrunnable in subagent mode. The two reports gate each
  other.

## Non-goals

- Same-basename collisions across roots feeding `byName` first-wins
  (`production-composition.ts:1187` `byName.has(name)` skip) — adjacent,
  unprobed, noted for the fixer.
- The refusal's enforcement — bug 0329.

## Fix

Preferred: build `byName` from the marked root's frozen callable-set
entries (`presentedName → calleePath` → closure sources via
`collectCallableClosureSources`), falling back to file derivation only for
names the snapshot lacks. Keeps the marshalled key space (presented names,
per the launch-contract table) authoritative on both sides. Alternative —
marshalling under a child-derivable key (path-relative) — changes the
documented carrier shape and still needs the caller's `tools:` for
containment context; not recommended. Either way, add the rename cell to
`tests/subagent-child-hash-refusal-e2e.test.ts` (match-admits and
edit-refuses arms).

## Provenance

Bug-hunt area `subagent-integrity`, seed hypothesis 1 (name/key alignment
between parent marshalling and child verification). Probed offline at
ee681f7b, both directions; probes deleted after confirmation.
