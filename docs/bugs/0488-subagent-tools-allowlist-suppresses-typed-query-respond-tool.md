# Bug 0488 — the subagent child's `--tools` allowlist suppresses the typed-query respond tool on pi ≥ 0.86

- **Status:** fixed (0.488.0).
- **Sev/Diff estimate:** S1/D3 — S1: on pi ≥ 0.86.0 every typed query
  (`let x: T = @…`, `@<T>…`) inside a child-process subagent whose launch
  carries `--tools`/`--no-tools` loses its in-session respond tool: the model
  cannot call `__theta_respond_<slug>` during the free phase or a
  respond-repair follow-up ("Tool not found"), and for non-trivial response
  schemas the repair loop exhausts its attempts and the worker Errs. Every
  quality-loop worker ends in a typed result query, so the whole fix/review
  pipeline breaks (observed: repeated review-fix lane deaths, 2026-09-21
  drain run). D3: the fix threads a statically-derived name set through the
  launch assembly at two spawn surfaces plus spec amendments.
- **Observed (2026-09-21, global pi 0.86.1 + pi-theta 0.487.0):** quality-loop
  drain run; multiple `review-fix#…` children (herdr panes, launch
  `--tools read,grep,bash`) looped on the final
  `summary: ReviewSummary = @…` statement: the model replied in prose/fenced
  JSON, theta's respond-repair follow-up named the synthesised tool
  (`Return your final answer using the __theta_respond_c40f310ae8897f46
  tool…`), the model then invoked that name natively and the host answered
  **"Tool not found"**, repeatedly, until the attempts budget exhausted.
  Several lanes died this way across two waves; lanes whose model happened to
  emit schema-valid JSON text early still bound (the off-session forced turn
  survives), which made the failure look intermittent.

## Root cause

pi 0.86.0 rebuilt tool handling ("Transcript-aware prompt and tool updates",
CHANGELOG 0.86.0; breaking change: providers read tool declarations via
`getCurrentTools()`), and `--tools` is now a **strict allowlist for all
tools** — built-in, extension, and custom, applied for the whole session
(`docs/settings.md` §Tools, `docs/usage.md`). On ≤ 0.85.x the allowlist
filtered the startup registrations only, and a mid-session
`pi.registerTool()` bypassed it.

theta's subagent launch composes `--tools <hostTools>` (or `--no-tools`) from
the callee's frontmatter callable set
(`src/runtime/subagent-launcher.ts:377-393` `hostTools`/`noHostTools`, emit at
`:540`; spec: subagent.md `#subagent-tools-host-names-only`, PIC-58). The
typed-query respond tool is registered **mid-session** by the child's own
pi-theta instance (conversation-drive.md §typed queries;
`live-prompt-query-driver.ts`), under a name minted per response schema —
`__theta_respond_<slug>` — that is never in the frontmatter set. On ≥ 0.86 the
allowlist therefore suppresses the registration: no `toolsAdded` transcript
entry, no model-facing declaration, no dispatch entry.

The launch composes an allowlist that excludes tool names the child's own
typed-query contract requires to be model-callable. It worked before 0.86 by
accident of the host's laxer allowlist semantics.

## Reproduction (all four cells run 2026-09-21, models claude-sonnet-5 / claude-fable-5)

Probe theta: `mode: prompt`, one typed query `let bound = @<"low" | "high">`…`?`,
then an untyped query interpolating `${bound}` (the binding witness).
Driven `--mode json -p "/probe" --no-session` on pi **0.86.1**:

| cell | launch | `toolsAdded` entry | free-phase respond call | outcome |
|---|---|---|---|---|
| 1 | no `--tools` | ✅ | ✅ native call, executed | binds via tool |
| 2 | no `--tools`, bash tool-loop rounds first, fable-5 | ✅ (mid-session) | ✅ | binds via tool |
| 3 | `--tools read,grep,bash` | ❌ never | ❌ model replies text | bound only via the off-session forced turn (trivial union; object schemas fail here in practice) |
| 4 | `--tools read,grep,bash,__theta_respond_1aae0990d53b3485` | ✅ | ✅ native call, executed | binds via tool — **fix verified** |

Cell 4 additionally proves pi does **not** reject an allowlist name that is
unknown at startup (no exit-2; the eager-validating host of bug 0218 is the
other dialect — that dialect interaction must be re-checked at implementation
time).

Same-annotation determinism: cells 1, 2 and 4 minted the identical
`__theta_respond_1aae0990d53b3485` from two different theta files — the name
is a pure function of the lowered response schema's canonical form
(`canonicalSlug` = `canonicalHash(...)` sliced to 16 hex,
`src/parser/schema-lowering.ts:103-115`; reservation grammar
`src/parser/synthesised-names.ts`; bug 0099).

## Fix (SETTLED — operator, 2026-09-21)

**Append the statically-known synthesised respond-tool names to the child's
`--tools` allowlist at launch.** Typed queries are parse-time artifacts; their
lowered response schemas — and therefore their `__theta_respond_<slug>` names
— are computable at load with the existing `canonicalSlug` machinery. At
child-launch assembly:

1. Enumerate every typed query in the callee body (including bodies reached
   through the callee's own `subagent fn` declarations ONLY for the session
   that will drive them — each launch enumerates the body IT drives, FN-7's
   computed-twice symmetry).
2. Mint each query's `__theta_respond_<slug>` and append (deduplicated) to
   `hostTools`.
3. A callee with typed queries and NO host tools launches with
   `--tools <respond names>` instead of `--no-tools` (the `noHostTools` arm
   flips only when respond names exist).
4. A callee with neither host tools nor typed queries keeps `--no-tools`
   exactly as today.

The same enumeration applies to the binder's `__theta_bind_<slug>` /
`__inline_<slug>` forms ONLY if the implementation finds a child-side
registration of them (the binder runs parent-side and its forced turn goes
through off-session `complete()`; expectation: NOT needed — verify, and
document the verification in the fix record rather than adding names on
speculation).

Spec amendments in the same change:
- subagent.md `#subagent-tools-host-names-only`: the synthesised respond-tool
  names are host-registry names (the child's own extension registers them
  mid-session) and MUST be carried in the allowlist; `.theta` callable names
  stay excluded (bug 0218 unchanged).
- subagent.md launch template (`:6`) and the launcher doc-comment
  (`subagent-launcher.ts:437-446, :377-393`): the `--tools` csv =
  host-tool names ∪ respond-tool names.
- frontmatter-fields-a.md `tools` note (`:74`): the subagent-mode enforcement
  mechanism sentence gains the respond-name clause.

### Declined alternatives

- **Drop `--tools`** — violates the no-inheritance rule: in subagent mode the
  allowlist IS the mechanism restricting the child's model-facing tool
  surface (frontmatter-fields-a.md:74, conversation-drive.md "the child pi
  process builds its own tool definitions from its startup discovery and the
  `--tools` allowlist"). Without it the child model sees every ambient tool.
- **Settings `defaultTools` overlay** — preserves extension tools wholesale
  (leaks OTHER extensions' tools into the child surface) and has no clean
  per-child injection channel.
- **Require pi < 0.86** — not a fix. (Operational mitigation applied
  2026-09-21: global pi downgraded to 0.85.1 until this ships.)

### Witness guidance

Offline (deterministic, the authoritative reds):
- argv-composition: launcher input for a body with typed queries → argv
  `--tools` csv contains each minted respond name exactly once; control body
  without typed queries → argv byte-identical to today's.
- the `noHostTools` flip: no host tools + typed queries → `--tools
  <respond-only>`, not `--no-tools`; no host tools + no typed queries →
  `--no-tools` unchanged.
- name-mint parity: the names appended at launch equal the names the drive
  layer mints at query time for the same schemas (single-source check against
  `canonicalSlug`; the independent node:crypto oracle pattern from
  tests/live/typed-query-wire-shapes.test.ts:296-304 may be reused).
- subagent-fn twin: the fn-session launch carries the fn body's respond
  names, not the enclosing theta's.

Live: the pinned SDK (0.80.10) cannot witness the ≥ 0.86 host-side filtering;
the live cell asserts the spawned child argv carries the names (real-spawn
path), and the 0.86.1 end-to-end verification is recorded in this document
(cell 4). Do not weaken the offline argv witnesses to accommodate the pin.

## Related

- Bug 0218 (allowlist name validation by the other host dialect — re-check
  that dialect's behaviour with respond names at implementation time).
- Bug 0099 (canonical-form slug; the determinism this fix relies on).
- Bug 0481 (typed-query forced-choice degradation — the sibling seam).
- Bug 0487 (the load-time half of tool-visibility; this is the launch-time
  half).
- PIC-58, subagent.md `#subagent-tools-host-names-only`,
  conversation-drive.md §typed queries, FN-7.
- pi CHANGELOG 0.86.0 (breaking changes), docs/settings.md §Tools.

## Fix (0.488.0)

- **What shipped:**
  - `src/parser/theta-document.ts` — new `collectSessionTypedQueries(body)`: a
    collecting twin of `detectTypedQueryExpression` that STOPS at `subagent fn`
    boundaries (FN-7: a subagent-fn body is driven by its own launch) but still
    descends ordinary `fn` bodies; `never`-exhaustiveness backstops on its
    walk. (§Fix step 1.)
  - `src/runtime/typed-query-validation.ts` — new `respondToolName(slug)`
    (`"__theta_respond_" + slug`), single-sourcing the name-prefix; the drive
    layer's `:205` mint routed through it; slug stays `respondSchemaSlug`
    (canonical form, bug 0099). (§Fix step 2.)
  - `src/runtime/subagent-launcher.ts` — `SubagentArgvInput.respondToolNames`;
    `HostCliDialect.toleratesUnregisteredToolNames` (Pi `true`, Oh-My-Pi
    `false`); the emit site unions `hostTools ∪ respondToolNames`
    (deduped, host-first) and flips the `noHostTools` arm to `--tools
    <respond-only>` only when respond names exist — dialect-gated so Oh-My-Pi's
    argv is byte-identical to today. (§Fix steps 2–4; the four cases.)
  - `src/extension/production-theta-producer.ts` — new module-level
    `collectLaunchRespondNames(theta, entry)`: FN-7-aware body selection (theta
    entry → `theta.body`; fn entry → the named subagent fn's body plus
    same-file ordinary-fn bodies; both → imported modules' bodies), lowered
    against the CALLER theta's merged decls (parity with the child's own
    `#resolvePromptQuery` lowering site), minting each respond name through the
    same `respondSchemaSlug`+`respondToolName` recipe; wired into
    `spawnSubagentConversation`'s launch argv. (§Fix step 1.)
  - Spec: subagent.md `#subagent-tools-host-names-only` (respond names are
    host-registry names, carried and dialect-gated; `.theta` names still
    excluded), `#subagent-tools-allowlist-suppression` (the ≥0.86 strict-
    allowlist reach to mid-session registrations), the launch template and the
    RFC-0005-differences `--tools` row, and frontmatter-fields-a.md `#tools`
    enforcement-mechanism sentence. Launcher doc-comments amended in code.
- **Gates:** witness `tests/b0488-*.test.ts` RED before (7 cells: respond name
  absent from the child `--tools`; seams missing) → GREEN after (14/14, incl.
  the real-spawn cell). Full default suite `npm test` 698 files / 11616 tests
  green. `npm run typecheck` clean. `npm run lint` clean.
- **Review:** 2 rounds. R1 (deep) — correctness F1 (launch missed typed queries
  in inline-called sibling/imported ordinary-fn bodies), F2 (fn-entry lowered
  against the imported module's decls, not the caller's the child actually
  uses), plus F3 citation / F4 banned-word / F5 unwitnessed producer half /
  R2–R3; all fixed. R2 (fast) — CLEAN, no escalation.
- **Verification:** SOLID. (1) Neutralising `collectLaunchRespondNames`/the
  emit union reds every argv/real-spawn witness with the bug-0488 signature;
  restore → green. (2) Full suite green. (3) End-to-end: new
  `tests/b0488-real-spawn-respond-argv.test.ts` spawns a REAL child (child pins
  per AGENTS.md `#subagent-child-pins`, provider-free) and asserts the ACTUAL
  spawned argv `--tools` carries `__theta_respond_1aae0990d53b3485` and the real
  host completes the invocation with no exit-2 on the unrecognised-at-startup
  entry — re-verifying cell 4 against this repo's pinned pi build; the pinned
  SDK 0.80.10 cannot witness the ≥0.86 host-side filtering, so this is the
  documented live fidelity. (4) Lint + typecheck clean.
- **Residuals:**
  1. Binder forms `__theta_bind_<slug>` / `__inline_<slug>` are NOT carried and
     NOT needed — VERIFIED: the binder runs parent-side via off-session
     `complete()` + `forcedToolChoiceForApi` (`binder-inference.ts`), never
     `pi.registerTool`, and the child skips the binder entirely under PIC-60
     marshalled params (`production-theta-producer.ts` "skips the binder
     entirely" / "binder bypassed"); `__inline_<slug>` are `$defs` hoist keys,
     not tool names.
  2. PIC-44 collision-disambiguated respond names (`__theta_respond_<slug>_<n>`,
     minted only on a 64-bit canonical-hash collision between two distinct
     schemas in one session, which itself fires
     `theta/runtime/registration-cache-collision`) cannot be foreseen by the
     static launch mint and would be suppressed. Inherent to static minting;
     astronomically rare; not fixed.
  3. `dedupePreservingFirst` now dedupes the host-only arm too, so a host set
     with a duplicated underlying name (constructible only via an `as`-rename
     aliasing the same pi tool) emits once where HEAD emitted twice. Semantics
     unchanged (an allowlist is a set); no behavioural effect.
- **Discharge notes appended:** none.
- **Pinned dispositions / non-goals:** the fn-entry launch carries the fn
  body's respond names, not the enclosing theta's top-level body's (FN-7
  symmetry); over-collection of inline-callable ordinary-fn / imported bodies is
  deliberate and safe (cell 4: Pi tolerates an allowlist name unknown at
  startup; Oh-My-Pi gates all respond names out).
