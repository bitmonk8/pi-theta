---
id: PTQ-1075
title: three in-scope binder-dispatch tests each re-implement the canonical scriptEnvelope reply-scripting double instead of importing it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0381-echo-object-first-field-declaration-order.test.ts:73-83
  - tests/b0397-binder-failure-note-runtime-event.test.ts:202-212
  - tests/binder-post-merge-ajv-enforcement.test.ts:385-411
  - tests/helpers/scripted-live-session-harness.ts:250-268
sites: 3
fix_scope: cross-module
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# three in-scope binder-dispatch tests each re-implement the canonical scriptEnvelope reply-scripting double instead of importing it

## Observation
`tests/helpers/scripted-live-session-harness.ts` exports `scriptEnvelope(scripted, envelope, missingToolMessage?)`, a function that installs a `scripted.replyFor` closure returning a ToolCall-bearing assistant reply whose `name` is read off `context.tools[0].name` (falling back to `"__theta_bind_none"`, or throwing `missingToolMessage` when no tool name is present). Three files in this wave's scope each redeclare this exact mechanism locally under a different name instead of importing the export: `b0381-echo-object-first-field-declaration-order.test.ts` and `b0397-binder-failure-note-runtime-event.test.ts` each declare a module-local `scriptEnvelope` whose body is byte-identical to each other and functionally identical to the canonical export's no-`missingToolMessage` branch; `binder-post-merge-ajv-enforcement.test.ts` declares `toolCallReply` + `scriptToolCallEnvelope`, whose combined body reproduces the canonical export's `missingToolMessage`-supplied branch (throw when no tool name is present, otherwise return the same `role`/`content`/`stopReason`/`timestamp` shape). All three files already import other pieces from this same helper module (`scripted-live-session-harness.ts`) at their own top, so the module is in scope and in use at the point each local copy is declared.

## Evidence
tests/helpers/scripted-live-session-harness.ts:250-268 (the canonical export):
```ts
export function scriptEnvelope(
  scripted: { replyFor: undefined | ((context: unknown) => unknown) },
  envelope: unknown,
  missingToolMessage?: string,
): void {
  scripted.replyFor = (context: unknown): unknown => {
    const tools = (context as { tools?: ReadonlyArray<{ name?: unknown }> }).tools;
    if (typeof tools?.[0]?.name !== "string" && missingToolMessage !== undefined) {
      throw new Error(missingToolMessage);
    }
    const name = typeof tools?.[0]?.name === "string" ? tools[0].name : "__theta_bind_none";
    return {
      role: "assistant",
      content: [{ type: "toolCall", id: "tc-1", name, arguments: { envelope } }],
      stopReason: "toolUse",
      timestamp: 0,
    };
  };
}
```

tests/b0381-echo-object-first-field-declaration-order.test.ts:73-83 (byte-identical to b0397's copy below; the no-`missingToolMessage` branch of the canonical export, retyped):
```ts
function scriptEnvelope(envelope: unknown): void {
  scripted.replyFor = (context: unknown): unknown => {
    const tools = (context as { tools?: ReadonlyArray<{ name?: unknown }> }).tools;
    const name = typeof tools?.[0]?.name === "string" ? tools[0].name : "__theta_bind_none";
    return {
      role: "assistant",
      content: [{ type: "toolCall", id: "tc-1", name, arguments: { envelope } }],
      stopReason: "toolUse",
      timestamp: 0,
    };
  };
}
```
b0381's imports (top of file) already reach into the same helper module without pulling in `scriptEnvelope`:
```ts
import {
  binderProducerWithCapture as producerWithCapture,
  bindAndReadNote as bindAndReadEchoNote,
} from "./helpers/scripted-live-session-harness";
```

tests/b0397-binder-failure-note-runtime-event.test.ts:202-212 (identical body to b0381's above):
```ts
function scriptEnvelope(envelope: unknown): void {
  scripted.replyFor = (context: unknown): unknown => {
    const tools = (context as { tools?: ReadonlyArray<{ name?: unknown }> }).tools;
    const name = typeof tools?.[0]?.name === "string" ? tools[0].name : "__theta_bind_none";
    return {
      role: "assistant",
      content: [{ type: "toolCall", id: "tc-1", name, arguments: { envelope } }],
      stopReason: "toolUse",
      timestamp: 0,
    };
  };
}
```
b0397's own top-of-file import already reaches into the same module for five other names:
```ts
import {
  ajv as realAjv,
  parse,
  producerWithCapture,
  noteChannelEntries as channelNotes,
  type CapturedNote,
} from "./helpers/scripted-live-session-harness";
```

tests/binder-post-merge-ajv-enforcement.test.ts:385-411 (the `missingToolMessage`-supplied branch, split into two local functions):
```ts
function toolCallReply(name: string, args: Record<string, unknown>): unknown {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id: "tc-1", name, arguments: args }],
    stopReason: "toolUse",
    timestamp: 0,
  };
}

/**
 * Script a ToolCall reply carrying `{ envelope }`, naming the binder tool
 * production actually attached on the captured call — so the reply matches
 * whatever slug production derives for this fixture's envelope schema.
 */
function scriptToolCallEnvelope(envelope: unknown): void {
  scripted.replyFor = (context) => {
    const tools = (context as { readonly tools?: ReadonlyArray<{ readonly name?: unknown }> })
      .tools;
    const name = tools?.[0]?.name;
    if (typeof name !== "string") {
      throw new Error(
        "the binder call attached no forced tool, so no ToolCall reply can name it — the harness cannot script an envelope",
      );
    }
    return toolCallReply(name, { envelope });
  };
}
```
This file's own top-of-file import already reaches into the same module for five other names without pulling in `scriptEnvelope`:
```ts
import {
  AJV_SUMMARY_SEPARATOR,
  AJV_ARGS_PHRASE,
  ajvArgsNote,
  binderProducerWithCapture,
  type BinderCapturedNote as CapturedNote,
  noteChannelEntries,
} from "./helpers/scripted-live-session-harness";
```

Search: `grep -n "function scriptEnvelope\|function scriptToolCallEnvelope" tests/*.test.ts` returns the two `scriptEnvelope` declarations in b0381/b0397 and the `scriptToolCallEnvelope` declaration in binder-post-merge-ajv-enforcement.test.ts among this wave's scope (other files outside scope, e.g. `binder-forced-tool-dispatch.test.ts` and `params-default-*` files, declare their own `scriptToolCallEnvelope` too but are not cited here since they are outside the reviewed set).

## Why this is a problem
The reply-scripting mechanism — read the forced tool's name off the captured call's `tools[0]`, fall back or throw when absent, wrap it in a ToolCall-bearing assistant reply — is typed three separate times across three files that each already import other pieces of the very module (`tests/helpers/scripted-live-session-harness.ts`) that already exports this exact function under the name `scriptEnvelope`. Two of the three copies (b0381, b0397) are byte-identical to each other; the third (binder-post-merge-ajv-enforcement.test.ts) reproduces the canonical export's other parameterised branch under a different name and split across two functions. None of the three imports the export that already covers its own need.

## Suggested direction (non-binding, optional)
`tests/helpers/scripted-live-session-harness.ts` already exports `scriptEnvelope` parameterised over the `scripted` holder, the envelope, and an optional `missingToolMessage`; each of the three files' own local reply-scripting function is a call to that export with its own `scripted` object and (for the third file) its own message string, observed from the export's existing signature rather than designed here.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the named gate kin; the cited code is harness/fixture declaration, not a pinned count or inventory assertion.
- Recording-double check: `scriptEnvelope`/`scriptToolCallEnvelope` install a scripted REPLY (a stub, not a recording double), and none of the three files' own tests assert a "never called" MUST-NOT witness against this function; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "b0381-echo-object-first-field-declaration-order\|b0397-binder-failure-note-runtime-event\|binder-post-merge-ajv-enforcement" docs/bugs/*.md` finds `docs/bugs/0381-echo-object-first-field-model-key-order.md`, `docs/bugs/0397-binder-failure-notes-empty-event-payload.md`, and multiple docs naming `binder-post-merge-ajv-enforcement.test.ts` (bug 0066 and others) as witnesses for the file as a whole; none cites the internal `scriptEnvelope`/`scriptToolCallEnvelope`/`toolCallReply` declarations as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0381-echo-object-first-field-declaration-order\|b0397-binder-failure-note-runtime-event\|binder-post-merge-ajv-enforcement" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any file or `it()`/`describe()`, only that the reply-scripting function could be imported rather than retyped.
- Prior-finding check: `grep -rl "scriptEnvelope" quality/issues quality/resolved quality/intake` finds only `PTQ-0463`, `PTQ-0925`, and `PTQ-0935`, none of which lists `scriptEnvelope`/`scriptToolCallEnvelope`/`toolCallReply` among their cited locations (PTQ-0925 covers the `vi.hoisted`/`vi.mock` off-session scaffold, not the reply-scripting function; PTQ-0454/PTQ-0535/PTQ-0537, resolved, cover the `CapturedNote`/`parseDeps`/`parse`/`rootDouble`/`producerWithCapture`/`ctxDouble`/`noteChannelEntries` pieces of these same three files' harnesses and are already fixed to import from this module — this finding is the piece their fix left unmigrated). PTQ-0926 covers a disjoint `thetaInput`/`driveBinder` pair in the same file family.
- Coverage check: the claim is entirely about a repeated harness-code DEFINITION; each file's own tests exercise its own copy of the mechanism, so this is not a coverage-gap claim.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified D7 copy-paste double: all four excerpts reproduce verbatim at the cited lines (canonical export :250-268; b0381 :73-83 and b0397 :202-212 are byte-identical by mktemp sed-range diff, exit 0; post-merge `toolCallReply` :385-391 + `scriptToolCallEnvelope` :399-411 with `toolCallReply`'s only caller at :409, so the pair collapses to one `scriptEnvelope(scripted, envelope, msg)` call); every file's `scripted` holder is typed `replyFor: undefined | ((context: unknown) => unknown)` (off-session-mock :12; post-merge :126), exactly the export's parameter shape; all three files already import 2–6 other names from scripted-live-session-harness (:62, :66, :155); the canonical is live (imported by e2e-s5, echo-array, echo-value); docs/bugs grep for the three helper names → 0, coverage-matrix grep for the three files → 0, none is a gate file or a recording double; PTQ-0454/0535/0537 (fixed) migrated disjoint pieces of these same harnesses and never name these functions, PTQ-1022 is binder-forced-tool-dispatch's rootDouble trio. Accounting correction: the candidate's out-of-scope roster omits `tests/b0401-informational-notes-omit-details.test.ts:130` (a fourth byte-identical local `scriptEnvelope`). Consolidation for acceptance: same-wave siblings d7-05 (params-default-unresolvable-enum-variant:780-806) and d7-10 (params-default-enum-access-merge:427-453, same unresolvable range), both still pending, carry the identical root cause at disjoint files — this candidate is the carrier under the one-carrier-per-root-cause precedent (PTQ-0596/PTQ-0824); fold their locations plus b0401:130-140 and binder-forced-tool-dispatch:399 into this row rather than minting separate rows (triage: claude-fable-5-1)
