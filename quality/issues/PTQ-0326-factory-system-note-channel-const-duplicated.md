---
id: PTQ-0326
title: factory.ts redeclares its own private SYSTEM_NOTE_CHANNEL constant instead of importing system-note-channel.ts's exported one
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/factory.ts:117
  - src/extension/system-note-channel.ts:115
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone              # D4 only: clone | drift | parallel
wave: qw20260914091051
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-14
---

# factory.ts redeclares its own private SYSTEM_NOTE_CHANNEL constant instead of importing system-note-channel.ts's exported one

## Observation
`system-note-channel.ts` declares and exports `SYSTEM_NOTE_CHANNEL`, the
`customType` string every `theta-system-note` message is tagged with.
`factory.ts` separately declares its own, unexported, module-scope constant of
the same name and the same value, rather than importing the existing export —
even though `factory.ts` already imports four other named members
(`RendererGate`, `SystemNoteChannelHealth`, `sendSystemNote`,
`SystemNoteChannelDeps`) from that exact same module.

## Evidence
src/extension/system-note-channel.ts:113-115 — the canonical, exported
declaration:
```ts
/** The theta-internal system-note renderer channel `customType`. */
export const SYSTEM_NOTE_CHANNEL = "theta-system-note";
```

src/extension/factory.ts:116-117 — the independent, unexported redeclaration:
```ts
/** The theta-internal system-note renderer channel. */
const SYSTEM_NOTE_CHANNEL = "theta-system-note";
```

Diff verdict: **identical** — same identifier, same string value; only the
`export` modifier differs.

factory.ts's existing import from the same module (factory.ts:48-53), proving
there is no encapsulation/circularity barrier to importing one more member:
```ts
import {
  RendererGate,
  SystemNoteChannelHealth,
  sendSystemNote,
  type SystemNoteChannelDeps,
} from "./system-note-channel";
```

factory.ts's local copy is read at exactly one site, registering the
renderer for that channel:
```ts
// factory.ts:600
pi.registerMessageRenderer(SYSTEM_NOTE_CHANNEL, createSystemNoteRenderer());
```
system-note-channel.ts's canonical copy is read inside `sendSystemNote`'s own
message construction (system-note-channel.ts:419-423), the seam every
`theta-system-note` message actually goes out through:
```ts
    deps.pi.sendMessage(
      {
        customType: SYSTEM_NOTE_CHANNEL,
        content: note.content,
        ...
```
A third file in the same package already demonstrates the correct,
import-based pattern for this exact constant —
`src/runtime/slash-dispatch.ts:18-21`:
```ts
import {
  SYSTEM_NOTE_CHANNEL,
  type SystemNoteDetails,
} from "../extension/system-note-channel";
```
A repo-wide search for the bare string literal `"theta-system-note"` shows it
is assigned to a `const`/`export const` in exactly these two places
(`factory.ts:117`, `system-note-channel.ts:115`); every other hit in `src/` is
a backticked mention inside a comment, not a code declaration. Not present in
the clone-map (a single one-line literal assignment falls below the scanner's
token-window floor); found by reading.

## Why this is a problem
`factory.ts`'s copy and `system-note-channel.ts`'s copy currently agree by
coincidence of both never having been touched since authorship, not by any
mechanism that keeps them agreeing. The two copies are read by two different
consumers for two different purposes that must use the *same* channel id to
work at all: `factory.ts:600` registers the message renderer under its local
copy's value, while every actual message sent through `sendSystemNote` (the
only path `factory.ts` itself uses to deliver `theta-system-note` content, via
its own imported `sendSystemNote`) is tagged with `system-note-channel.ts`'s
copy's value at the point of construction. If either literal is ever edited in
one file and not the other — the ordinary way a constant gets renamed — the
renderer registration and the message tagging would diverge silently: no
compiler error (both are independent `string` literals, not a shared type),
no thrown exception, just every `theta-system-note` message thereafter falling
through to whatever Pi's default rendering does instead of the custom
renderer, in this one extension instance, with nothing in the diagnostics
stream to say why.

## Suggested direction (non-binding, optional)
The natural shared home (hypothesis) is `system-note-channel.ts`'s existing
exported `SYSTEM_NOTE_CHANNEL` — `factory.ts` already imports four sibling
members from the same module, so adding this one to the same `import { … }`
block would follow the pattern `slash-dispatch.ts` already uses for the
identical constant.

## False-positive check
- Reference search: `grep -rn "SYSTEM_NOTE_CHANNEL\\s*=\\s*\"theta-system-note\""`
  and a broader `grep -rn "theta-system-note" src --include=*.ts` (full output
  inspected) confirm exactly two `const`/`export const` declaration sites and
  no third.
- Both copies are live, each with a distinct real reader
  (`factory.ts:600`, `system-note-channel.ts:421`) — not a D2 dead-copy case.
- Import-graph check: `factory.ts`'s full import list from
  `./system-note-channel` was read in full; `SYSTEM_NOTE_CHANNEL` is not among
  the four names already imported, so this is a plain omission, not a partial
  re-export already in place.
- Not a spec-repeated vector: this is an internal wire-tag string, not a
  spec-cited enumeration that the spec itself restates in two places.
- Not tests/, not generated: both files are hand-authored production
  `src/extension/*.ts` modules.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both declarations verified verbatim (factory.ts:117 unexported const vs system-note-channel.ts:115 exported const, identical value); repo-wide grep for `"theta-system-note"` and for the `= "theta-system-note"` assignment pattern confirms no third site; clone-scan map on factory.ts shows no group here (below the 60-token floor, not a scanner miss, as claimed); both copies are live with distinct real readers (factory.ts:600 registerMessageRenderer vs sendSystemNote's own construction at system-note-channel.ts:421, the path factory.ts itself drives via its already-imported `sendSystemNote`), and system-note-channel.ts imports nothing from factory.ts so there is no circularity barrier — an accurate D4 clone with a stated drift-on-rename breakage, fix is a mechanical dedupe (triage: claude-opus-5)
