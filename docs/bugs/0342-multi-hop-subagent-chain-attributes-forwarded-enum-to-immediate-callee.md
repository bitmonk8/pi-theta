# Bug 0342 — A `.theta` enum value forwarded up a multi-hop subagent chain is attributed to the IMMEDIATE callee, not its declaring file: the PIC-59 envelope carries the wire string only, so `#validateInvokeReturn` retags each hop with the resolved path of the callee it read, and a value C declares but B forwards reaches A tagged `<B>#Sev` — it compares `!=` a value obtained directly from C and `==` B's own same-named enum

- **Status:** fixed (0.318.0).
- **Sev/Diff estimate:** S1/D3 — S1: silent wrong equality on a production
  path. A value forwarded through an intermediate subagent callee compares
  `valuesEqual` `false` against the same declaration obtained directly (false
  negative) and `true` against the intermediate's own same-named enum (false
  positive), with no diagnostic. D3: the tag is dropped at a cross-process
  serialization contract (the PIC-59 envelope carries wire only); carrying the
  declaring key across the boundary is a shared-surface change needing in-run
  adjudication, and 0337's landed witnesses must stay byte-green.
- **Kind:** defect — enum identity misattributed across a multi-hop invoke chain.
- **Affected** (verified at HEAD `7ec6fd2f`, v0.309.0):
  - `src/extension/production-theta-producer.ts:3930` —
    `#validateInvokeReturn(calleePath, returnSite, result, calleeResolvedPath)`,
    the post-AJV invoke-return decode.
  - `src/extension/production-theta-producer.ts:3934` — the `calleeResolvedPath:
    string | undefined` parameter: the resolved path of the file the invoke
    read (the IMMEDIATE callee), passed as `callee.sourcePath` at both call
    sites (`:3765`–`:3769` prompt→prompt attach, `:3808` subagent spawn /
    `tools:`-callee return).
  - `src/extension/production-theta-producer.ts:3976`–`3977` — the bug-0337
    Option-1 retag: `enumDeclaringPath: calleeResolvedPath` is threaded into
    `decodeInboundValue`, so the returned variant is minted with the IMMEDIATE
    callee's `enumDeclaringKey`, never the value's original declaring file.
  - `src/runtime/subagent-envelope.ts:138` — `serializeOkEnvelope` is
    `JSON.stringify` of the payload; a boxed enum carrier collapses to its bare
    wire string, so the tag does not cross the process boundary and is
    unrecoverable at the next hop up.
  - `src/runtime/subagent-envelope.ts:299` — `parseEnvelopeLine` re-reads the
    line; the parent receives a JSON primitive string, which is why the inbound
    decode retags rather than passing a boxed carrier through.
  - `src/runtime/inbound-boundary.ts:77`,`:90`–`91` — `decodeInboundValue`
    forwards `enumDeclaringPath` to `translateInbound`, which mints the tag via
    `enumDeclaringKey(enumDeclaringPath, name)` (`src/runtime/wire-translation.ts:223`).
  - `src/runtime/lexical-environment.ts:132` — `enumDeclaringKey(resolvedPath,
    declaredName)` returns `` `${resolvedPath}#${declaredName}` ``.
  - `src/runtime/value.ts:503` — `valuesEqual` compares `tagA === tagB && String(a)
    === String(b)`; two different declaring keys over the same wire compare
    unequal.
- **Observed at:** HEAD `7ec6fd2f`, v0.309.0.

## Summary

Bug 0337 (fixed 0.305.0) gave a `.theta`-declared enum file-qualified identity
across in-process invoke: a callee's returned variant carries its own
`enumDeclaringKey(<callee resolvedPath>, name)`, so it compares `!=` the
caller's own same-named enum. The Option-1 threading keys the invoke-return
retag on the IMMEDIATE callee's resolved path (`#validateInvokeReturn`'s
`calleeResolvedPath`, minted at `production-theta-producer.ts:3976`). This is
correct for one hop, which is 0337's whole scope.

In a multi-hop subagent chain the retag is wrong. Consider A invokes B, B
invokes C, and C returns an enum value up through B to A. C declares `enum Sev`
in C's file. At the C→B hop, B's `#validateInvokeReturn` reads C's envelope and
mints `<C>#Sev` — correct. But B is subagent-mode: when B tails that value up
to A, `serializeOkEnvelope` (`subagent-envelope.ts:138`) `JSON.stringify`s it
to the bare wire string `"low"`, dropping the `<C>#Sev` tag. A's
`#validateInvokeReturn` reads B's envelope as a JSON primitive and retags with
B's resolved path — the immediate callee — minting `<B>#Sev`. A now holds a
value C declared, tagged as if B declared it. The envelope carries only the
wire value, so no hop above the declaring file can recover where the value was
declared.

## Reproduction

Offline probe `tests/b0342scratch.test.ts` (written, run, deleted — not
committed). It composes the SAME production seams `#validateInvokeReturn`
composes at each subagent hop — `serializeOkEnvelope` → `parseEnvelopeLine` →
`decodeInboundValue` with the immediate callee's `enumDeclaringPath` — rather
than spawning a three-process tree, so the tag-loss is a real `JSON.stringify`
round-trip, not a stub. `enum Sev { Low = "low" }` declares in C
(`/theta/c.theta`); the value transits B (`/theta/b.theta`) to A. Measured
output (`console.log`, verbatim):

```
{"aValueDeclaringKey":"/theta/b.theta#Sev","expectedDeclaringKey":"/theta/c.theta#Sev","valuesEqual_A_vs_directFromC":false,"valuesEqual_A_vs_intermediateB_own":true,"wire_A":"low"}
```

A's value carries `/theta/b.theta#Sev` — the intermediate callee — where the
value's declaring file is `/theta/c.theta`. Against a value obtained directly
from C (single hop), `valuesEqual` is `false` (it should be `true`: both are
C's `Sev.Low`). Against B's own same-named `Sev.Low`, `valuesEqual` is `true`
(it should be `false`: B and C are different declaring files). The wire value
`"low"` is preserved, so the misattribution is invisible on the wire and
surfaces only on identity.

## Expected behaviour

A `.theta` enum value forwarded up a chain keeps its DECLARING file's identity
at every hop. `runtime-value-model.md:29` states the enum tag identifies "the
declaring `.theta` file together with the declared name … including across an
in-process `invoke` that carries a value out of its declaring file";
`runtime-value-model.md:34` states that at the invoke-return boundary "the
reattached tag keys on the CALLEE's declaring file (its `enumDeclaringKey`)".
For the value C declares, the declaring file is C at every hop — so A's
forwarded value must carry `<C>#Sev`, compare `==` a value obtained directly
from C, and compare `!=` B's own same-named enum. The measured `<B>#Sev`
attribution violates both sentences the moment the value crosses more than one
callee.

## Actual behaviour / root cause

`#validateInvokeReturn` (`production-theta-producer.ts:3930`) retags the
returned value with `calleeResolvedPath` — `callee.sourcePath`, the file the
invoke directly named (`:3976`–`:3977`). This is the immediate callee, not the
value's declaring file. For one hop the two coincide; for a forwarded value
they diverge. The tag the deeper hop correctly minted cannot survive the
intermediate's return, because the subagent envelope is a wire-only JSON
contract: `serializeOkEnvelope` (`subagent-envelope.ts:138`) is
`JSON.stringify`, which collapses the boxed enum carrier to its wire string and
drops the non-enumerable tag brand; `parseEnvelopeLine` (`:299`) hands the
parent a primitive string, so the parent's decode retags from scratch off the
only path it has — the immediate callee's. Because `valuesEqual`
(`value.ts:503`) compares the declaring key, the misattributed value then
judges equality wrongly in both directions.

0337's reproduction and its witnesses are single-hop: the b0337 witness (Cell 4
mode-invariance) and every re-anchored offline cell invoke a callee directly and
read its return once. The multi-hop case was recorded as out of scope
(`0337` §Fix (0.305.0) Residuals item 1;
`.pi/tmp/fixes/0337-report.md` §Residuals/notes item 1).

## Why it matters

A subagent chain of depth ≥ 2 that forwards an enum return silently corrupts
that value's nominal identity: a downstream `==` against the true declaration
answers `false`, and a `==` against an unrelated same-named enum in the
forwarding file answers `true`, with no diagnostic and an unchanged wire value.
This is the same silent-equality class 0337 closed for one hop, reopened one
level deeper.

## Fix

Thread the value's DECLARING file's key through the envelope and decode chain so
multi-hop forwarding preserves declaration identity: the tag a hop mints must
carry the file the value was declared in, not the file it was last read from.
The subagent envelope carries only the wire value today
(`subagent-envelope.ts:138`), so the declaring key has to travel with the value
across the process boundary (or be reconstructed from something that does) —
that carriage is the sub-choice this report leaves to the fixing lane, since it
changes a cross-process serialization contract and admits more than one design.

Constraint, pinned: the one-hop behaviour bug 0337 landed must stay
byte-identical. The retag for a value a callee itself declares still keys on
that callee's file; only a forwarded value gains its deeper declaring key. The
b0337 witness (`tests/b0337-theta-enum-identity-invoke.test.ts`), including its
Cell 4 mode-invariance assertion that the attach and subagent legs agree, and
the four 0340-re-anchored LPA cells (once landed) must remain green unchanged.
Any new multi-hop witness is additive.

This fix depends on
[0340](./0340-lpa-live-cross-file-enum-equality-anchors-stale-after-0337.md)
landing its LPA re-anchor first only insofar as both touch the post-0337 enum
identity surface; 0342 changes the forwarding carriage, 0340 re-anchors stale
live cells, and the two do not share a fix site.

## Provenance

- Surfaced by the bug 0337 fix lane, recorded as an out-of-scope residual:
  `.pi/tmp/fixes/0337-report.md` §Residuals/notes item 1 ("Multi-hop subagent
  chains attribute a forwarded enum to the IMMEDIATE callee … 0337 is one-hop;
  out of scope"), and mirrored in the shipped
  `0337` doc §Fix (0.305.0) Residuals item 1.
- Reproduced offline at HEAD `7ec6fd2f` by `tests/b0342scratch.test.ts`
  (written, run, deleted; case-insensitive sweep confirms no `b0342scratch`
  reference remains in the source tree). The probe composes the real production
  seams (`serializeOkEnvelope` / `parseEnvelopeLine` / `decodeInboundValue` /
  `valuesEqual` / `enumDeclaringKey`); the tag-loss is a genuine `JSON.stringify`
  round-trip. No process tree was spawned and no live provider was contacted.
- All `path:line` cites in §Affected verified by `Read`/`grep` at HEAD
  `7ec6fd2f` offline. No existing test forwards an enum return through two
  invoke hops (the b0337 Cell 4 witness is single-hop root→callee), so no pinned
  cell asserts the current misattribution.
- Related:
  [0337](./0337-theta-enum-identity-collides-across-in-process-invoke.md) —
  fixed (0.305.0); gave `.theta` enums file-qualified identity across one-hop
  in-process invoke and keyed the retag on the immediate callee (this report is
  its multi-hop residual).
  [0305](./0305-enum-identity-minted-from-alias.md) — fixed (0.290.0); the
  `.thetalib` declaring-key scheme 0337 generalised to `.theta`.
  [0340](./0340-lpa-live-cross-file-enum-equality-anchors-stale-after-0337.md) —
  open; re-anchors the four stale LPA live cells to the post-0337 semantics on
  the same enum-identity surface.

## Fix (0.318.0)

- What shipped:
  - `src/runtime/subagent-envelope.ts` — added the OPTIONAL `enum_tags`
    sidecar to the `theta_result` `ok` arm (`EnumTagEntry {p,k}`), emitted by
    `serializeOkEnvelope` only when the value carries ≥1 enum (enum-free
    returns byte-identical), and a trust-boundary `parseEnumTagsSidecar` that
    ignores an absent/malformed sidecar (no throw, no new diagnostic code).
  - `src/runtime/enum-tag-carriage.ts` (new) — the two value-graph walks:
    `collectForwardedEnumTags` (child, records each enum-boxed position's
    declaring key by RFC-6901 pointer) and `retagForwardedEnums` (parent,
    restores per-position keys after decode). Both descend objects+arrays,
    NOT `Result` payloads (mirrors `rebuildInbound`'s reach exactly); bounded
    by `MAX_JSON_DEPTH`; object writes via `defineRecordField` (`__proto__`
    house pattern).
  - `src/runtime/value.ts` — `enumDeclaringTagOf` public reader.
  - `src/runtime/subagent-json-driver.ts` — carries `enumTags` on
    `SubagentInvocationResult`.
  - `src/extension/theta-composition-producer.ts` — optional
    `ConversationBinding.forwardedEnumTags` accessor.
  - `src/extension/production-theta-producer.ts` — child emit collects the
    sidecar; the subagent `drive()` captures `result.enumTags`;
    `#validateInvokeReturn` gains a 5th param and re-applies the sidecar AFTER
    the existing immediate-callee decode — SUBAGENT LEG ONLY (the attach call
    site is unchanged; the in-process attach leg was never broken, its boxed
    carrier survives with its deep key).
  - `docs/spec_topics/pi-integration-contract/subagent.md` — PIC-59 gains the
    `#subagent-enum-tags-sidecar` bullet (additive, `v` stays 1,
    old-envelope-tolerant, enriches artefact 4 — not a fifth); the
    *Error fidelity* clause names bug 0342 as the exposed gap.
  - `docs/spec_topics/runtime-value-model.md` — the invoke-return
    wire-name-translation sentence generalised to multi-hop (tag keys on the
    value's DECLARING file at every hop), 0337's one-hop wording intact.
- Gates: witness `tests/b0342-forwarded-enum-subagent-chain.test.ts` GREEN
  (neutralize→RED on the 3 documented soft assertions→restore→GREEN, verifier);
  full `npm test` = 497 files / 9696 tests, zero failures; `npm run typecheck`
  clean; `npm run lint` clean; live cell
  `tests/live/b0342live-…test.ts` under the lock GREEN (`RESULT=false/true`),
  neutralized red-proof `RESULT=true/false`.
- Review: 2 rounds. R1 (deep) — F1 [correctness] wire-renamed-field pointer
  misalignment (DISPROVEN empirically: the subagent invoke-return decode is
  theta-side-keyed, `lowerQueryResponseSchema` emits theta property names, so
  collect/retag pointers always align; locked by a regression cell), F2 [spec]
  `enum_tags` located in the envelope payload not the value (reworded), R1
  [prose] garbled `EnumTagEntry` comment (reworded). R2 (fast) — CLEAN.
- Verification: SOLID. (1) witness reds without the fix and greens with it,
  byte-exact restore; (2) full suite 497/9696 green; (3) live green
  `false/true` / neutralized red `true/false`; (4) typecheck + lint clean.
- Residuals:
  1. Corpus-wide `path:line` citations to `production-theta-producer.ts`,
     `subagent-envelope.ts`, `value.ts` in unowned test files and other
     `docs/bugs/*.md` shifted by this diff and were NOT exhaustively
     re-swept (only the 0342-adjacent + co-located envelope tests were
     re-cited). No gate depends on them; a broad sweep in a shared tree was
     judged disproportionate/risky. Parent may run a citation pass.
  2. Nested-`Result`-payload enum identity across a subagent hop is NOT
     carried (both walks skip `Result`, mirroring the one-hop decode reach) —
     parity with 0337, not a widening; recorded as a non-goal, not a
     regression.
- Discharge notes appended: none (no sibling bug docs edited).
- Pinned dispositions / non-goals: one-hop behaviour (0337 Cell 4
  mode-invariance, b0067 one-hop composite) stays byte-identical — only a
  FORWARDED value across a subagent hop gains its deeper declaring key; the
  in-process attach leg is untouched (it was never broken); the retag reach
  mirrors the one-hop decode exactly (objects + arrays + `$ref` + union arms;
  not `Result` payloads); `v` unchanged, no fifth marshalled artefact.
