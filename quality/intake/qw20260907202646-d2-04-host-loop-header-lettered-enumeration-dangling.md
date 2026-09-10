---
id: pending
title: production-host-loop-dispatch.ts's header points at an "(a)–(f) wiring below" while the list below it is a three-item numbered list and no lettered items exist in the module
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/production-host-loop-dispatch.ts:3-12
  - src/extension/production-host-loop-dispatch.ts:14-27
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# production-host-loop-dispatch.ts's header points at an "(a)–(f) wiring below" while the list below it is a three-item numbered list and no lettered items exist in the module

## Observation
The module header of `production-host-loop-dispatch.ts` states that the module
"wires the three injectable collaborators" of the host-loop dispatch seam, then
eight lines later says "The (a)–(f) wiring below is identical in both; only the
backing session differs:" and introduces a list. The list that follows is
numbered `1.`–`3.` (one item per injectable collaborator). No `(a)`…`(f)`
markers appear anywhere in the file. The lettered enumeration lives in the spec
(`docs/spec_topics/pi-integration-contract/subagent.md`, PIC-64 "Host-loop
wiring", items (a)–(f)), whose sentence "the (a)–(f) wiring is identical in
both, the only difference being which session backs the dispatch" the header
paraphrases with the word "below" appended.

## Evidence
src/extension/production-host-loop-dispatch.ts:3-12 — the same paragraph states
"three injectable collaborators" and then points "below" at "(a)–(f)":

```ts
// This module wires the three injectable collaborators of the leaf-tested
// host-loop dispatch seam (`src/runtime/host-loop-dispatch.ts`
// `dispatchViaHostLoop`) against the REAL Pi extension surface, following the
// PASSED `.prototype-hld` blueprint (Pi v0.80.10). A code-side `<name>(args)`
// call to an EXTENSION tool holds no `execute` handle in EITHER mode — the
// public extension API strips it — so the only no-upstream execution rung is
// host-loop dispatch, establishable wherever a real host session with an agent
// loop backs it: the subagent-root child AND the parent's live user session
// (prompt mode). The (a)–(f) wiring below is identical in both; only the
// backing session differs:
```

src/extension/production-host-loop-dispatch.ts:14-27 — the list that is
"below", numbered 1–3:

```ts
//   1. `registerProvider(request)` — register a theta-controlled provider whose
//      two-state `streamSimple` AUTHORS the `tool_use` itself (code-supplied
//      arguments verbatim, zero model tokens). Returns the unregister handle
//      (`pi.unregisterProvider`, exposed by v0.80.10) plus a deactivation flag
//      the stream fn respects even before unregistration lands.
//   2. `runHostTurn()` — snapshot the active set (PIC-17), install `[toolName]`,
//      switch the session model to the bridge, ARM the `agent_settled` barrier
//      BEFORE `sendUserMessage` (the prototype's key deviation from Bug 0001:
//      `waitForIdle()` alone returns before the fabricated turn even starts),
//      send the encoded request, await settle, then read the appended toolResult
//      back from the session transcript.
//   3. `restoreModel()` — restore the session model and the active set, ALWAYS
//      (the seam's `finally`), so a thetaAbort mid-turn never leaves the bridge
//      model installed.
```

`grep -n "(a)\|(b)\|(c)\|(d)\|(e)\|(f)" src/extension/production-host-loop-dispatch.ts`
returns exactly one hit: line 11, the reference itself.

## Why this is a problem
The header's cross-reference resolves to nothing inside the module: a reader
following "(a)–(f) … below" finds a differently-shaped, differently-counted
list. The two statements are eight lines apart in one paragraph and give the
reader two counts (three, six) for the same wiring. The sentence is a
paraphrase of the spec's own sentence with "below" substituted for the spec's
lettered list, so the anchor was rewritten without the referent following it
into the module.

## Suggested direction (non-binding, optional)
Either name the spec section the lettered items live in, or drop the letters so
the reference matches the 1–3 list the module actually carries.

## False-positive check
- Enumeration search: `grep -n "(a)\|(b)\|(c)\|(d)\|(e)\|(f)"` over the file →
  one hit (line 11). Also searched for bare `a)` / `(a` forms and for `(a)–(f)`
  as a literal; no other markers.
- Referent search: `grep -rn "host-loop-dispatch" docs/spec_topics/pi-integration-contract/subagent.md`
  → the (a)–(f) enumeration is spec-side (subagent.md PIC-64 "Host-loop wiring"),
  confirming the letters name a real list that is not in this module.
- Not a deadness claim: nothing here is unreachable code; the finding is a
  dangling in-module cross-reference. No production or test code is implicated,
  so the "tests are the only callers" rule does not apply.
- Checked the numbered list is current: the three items map one-to-one onto the
  `HostLoopDispatchDeps` members constructed at
  `production-host-loop-dispatch.ts:414/488/537` (`registerProvider`,
  `runHostTurn`, `restoreModel`), so the "three injectable collaborators" half
  of the paragraph is accurate and only the lettered reference is not.

## Triage
verdict: questionable — excerpts reproduce verbatim at :3-12/:14-27 and grep confirms line 11 is the file's only (a)-(f) hit, but the anchor is weak: line 40 of the same header already names the spec section holding (a)-(f) (PIC-64 #subagent-host-loop-dispatch), which is the candidate's own first suggested remedy, and the "two counts (three, six)" argument is a category error (spec's six = contract details at subagent.md:141; module's three = HostLoopDispatchDeps members), leaving a one-word prose imprecision that is none of D2's smells — a human should rule (triage: claude-opus-5)
verdict: questionable — independently reproduced: excerpts verbatim at :3-12/:14-27, line 11 is the file's sole (a)–(f) hit, the letters live at subagent.md:172 (PIC-64 "Host-loop wiring") with the paraphrased sentence, and the 1–3 list maps onto HostLoopDispatchDeps' three members (host-loop-dispatch.ts:128/130/139; built at :414/:488/:537); but the anchor reaches no D2 smell: blame shows no revision of this module ever carried lettered items (22306e5d had the 1–3 list with no letters; the sentence was authored fresh in b8d4fd2c while the spec's (a) item already existed at both commits), so this is neither historical drift nor excision residue; the header's own Spec line (:40, "PIC-64 #subagent-host-loop-dispatch") already names the section holding (a)–(f) and the module does implement all six incl. (f) serialisation (:358/:393/:587-588), so the reference resolves one paragraph down rather than to nothing; the "two counts (three, six)" argument compares six spec contract details with three seam collaborators, a category error — what remains is a one-word prose imprecision ("below" beside a spec label), a real observation whose anchor is taste, so a human should rule; no dedupe hit (PTQ-0027 cites :509-583, PTQ-0134 names this file only inside an excerpt, intake d2-02 cites :218-240) (triage: claude-opus-5)
