---
id: PTQ-1515
title: renderBinderSystemNote's transport arm interpolates the runtime-supplied `<message>` with only the rule-2 cap, while every sibling binder failure-note renderer passes its runtime-supplied substring through rule-1 single-line sanitisation
lens: D6
status: fixed
verdict: confirmed
locations:
  - src/binder/retry-taxonomy.ts:115-121
  - src/binder/retry-taxonomy.ts:109-114
  - src/binder/system-note.ts:122-126
  - src/binder/compact-transcript.ts:386-399
  - src/extension/binder-run.ts:649-658
  - src/extension/binder-run.ts:731-735
sites: 6
fix_scope: module
d6_class: text-drift
d6_anchor: docs/spec_topics/binder/defaulting-system-note-echo.md#system-note-rendering
wave: qw20260927174614
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-27
---

# renderBinderSystemNote's transport arm interpolates the runtime-supplied `<message>` with only the rule-2 cap, while every sibling binder failure-note renderer passes its runtime-supplied substring through rule-1 single-line sanitisation

## Observation

`renderBinderSystemNote` (src/binder/retry-taxonomy.ts) renders the binder
failure-mode rows. Four arms (`needs_info`, `ambiguous`, `malformed`,
`ajv_args`) go through `renderFailureNote`, which runs the suffix through
`sanitizeSystemNoteSubstring` (rule 1) and then `capSystemNote` (rule 2). The
`transport` arm builds its own string and applies only `capSystemNote`, so
`surface.message` goes into the user-facing note unchanged. The other binder
failure row that also builds its own string instead of using the em-dash
grammar, `renderCustomTypeUnsafeNote` (src/binder/compact-transcript.ts),
applies `sanitizeSystemNoteSubstring` to its runtime-supplied `<value>`
before the cap. Neither producer of the transport `message` in
src/extension/binder-run.ts applies rule 1, and `sendSystemNote` does not
sanitise either. I ran a scratch check in this session under $TEMP (npx tsx):
a transport message of `"400 bad\nline two"` renders as
`"theta /t: argument binder unavailable (anthropic-messages: 400 bad\nline two)"`
(still two lines). The same line break in an `ajv_args` summary renders as
`"... produced invalid args — /x bad line two"`, and in a custom-type value it
renders as `"... not transcript-safe: 'a b'"`.

## Evidence

**Divergent side: src/binder/retry-taxonomy.ts:115-121** (the transport arm, which applies the cap only):

```ts
    case "transport":
      // The transport row uses the `(<provider>: <message>)` parenthetical
      // rather than the em-dash suffix boundary; `<provider>` is the
      // classifier's `Model<Api>.api` value rendered verbatim.
      return capSystemNote(
        `theta /${thetaName}: argument binder unavailable (${surface.provider}: ${surface.message})`,
      );
```

**Sibling A: src/binder/retry-taxonomy.ts:109-114** (the same switch, where a runtime-supplied `<ajv-summary>` goes through the rule-1 composer):

```ts
    case "ajv_args":
      return renderFailureNote({
        thetaName,
        fixedPhrase: "argument binding produced invalid args",
        suffix: surface.ajvSummary,
      });
```

**Sibling A's composer: src/binder/system-note.ts:122-126:**

```ts
export function renderFailureNote(input: FailureNoteInput): string {
  const suffix = sanitizeSystemNoteSubstring(input.suffix);
  const note = `theta /${input.thetaName}: ${input.fixedPhrase} ${EM_DASH} ${suffix}`;
  return capSystemNote(note);
}
```

**Sibling B: src/binder/compact-transcript.ts:386-399.** This is the other failure row that builds its own string outside the em-dash grammar. It sanitises its runtime-supplied value, and its comment says why:

```ts
/**
 * BNDR-9 — render the user-facing custom-type-unsafe system note through the
 * custom-type-unsafe row of the Failure-mode templates
 * (`theta /<name>: custom-message type is not transcript-safe: '<value>'`).
 *
 * The `<value>` suffix passes through the V11e rule-1 single-line sanitisation
 * (an unsafe `customType` may contain a `\n`/`\r`) and the whole note through
 * the rule-2 code-point cap; the surrounding template text is fixed.
 */
export function renderCustomTypeUnsafeNote(thetaName: string, value: string): string {
  const suffix = sanitizeSystemNoteSubstring(value);
  const note = `theta /${thetaName}: custom-message type is not transcript-safe: '${suffix}'`;
  return capSystemNote(note);
}
```

**Where the transport `message` comes from: src/extension/binder-run.ts:649-658** (the throw arm uses the coerced thrown value as-is):

```ts
      const thrownMessage = coerceUnderlyingString(thrown);
      // Bug 0481 (throw arm): the anthropic adapter's `result()` THROWS the
      // error-terminated stream's message, so the model-level forcing
      // rejection arrives here on that adapter. Same one-shot degradation as
      // the resolved arm below.
      if (!degraded && isForcedToolChoiceRejection(thrownMessage)) {
        degraded = true;
        continue;
      }
      return { outcome: { kind: "transport", provider, message: thrownMessage } };
```

**src/extension/binder-run.ts:731-735** (the classified arm passes the provider's `errorMessage` text through `summariseErrorField`, which returns a string input unchanged, at src/runtime/err-field-summary.ts:95-98):

```ts
      const message =
        classified.message !== ""
          ? summariseErrorField(classified.message)
          : "provider transport failure";
      return { outcome: { kind: "transport", provider, message } };
```

**Why these are the same class.** All four renderers build a
`theta /<name>: …` binder failure row for the `theta-system-note` channel, and
each one puts a runtime- or model-supplied substring into fixed template text.
They are listed together in the failure-mode table at
docs/spec_topics/binder/determinism-cancellation-failure.md:44-54. The
transport and custom-type rows are the two that build their own string outside
`renderFailureNote`. Only the transport row skips rule 1.

**Anchor, quoted verbatim.** docs/spec_topics/binder/defaulting-system-note-echo.md:16:

> All binder-emitted system notes — the success echo, the `needs_info` and `ambiguous` failure messages, and the three runtime-emitted failure rows in the table below — share one line-discipline. The rules apply uniformly to every model-supplied or runtime-supplied substring interpolated into the note; `bind_echo` and the failure-modes table reference back here rather than restating them.

The spec also says the transport `<message>` is runtime-supplied content
(docs/spec_topics/binder/determinism-cancellation-failure.md:42): "`<name>`,
the transport-failure row's `<provider>` and `<message>`, the custom-type-unsafe
row's `<value>`, and `<ajv-summary>` carry runtime- or
classifier-/validator-derived content".

**Bug ruling on this same shape.** docs/bugs/0087-echo-note-newline-unsanitised.md:7-10
(fixed 0.56.0) said the echo emitter "composes only the *cap* half of the
shared line-discipline and never the *single-line* half". The fix added rule 1
at `renderString`. The Non-goals at :219-221 cleared only the arms that go
through `renderFailureNote`: "Not about the binder failure-arm notes
(`needs_info`, `ambiguous`, malformed-envelope) — those route through
`renderFailureNote` and are rule-1-clean." The transport arm is not in that
list, and today it has the cap-only shape that 0087 fixed on the echo.

**Searches run in this session:**
- `grep -rn "capSystemNote(" src | grep -v "function capSystemNote"` → 5 hits:
  compact-transcript.ts:398, retry-taxonomy.ts:119, retry-taxonomy.ts:123,
  system-note.ts:125, binder-run.ts:582. Of these, retry-taxonomy.ts:119 (the
  transport arm) is the only one that interpolates a runtime-supplied substring
  with no `sanitizeSystemNoteSubstring` call. :123 (cancelled) has no
  placeholder. :398 and :125 sanitise first. :582 is the echo, whose values are
  sanitised per value inside `renderString` (src/render/argument-echo.ts:118).
- `grep -rn "sanitizeSystemNoteSubstring(" src | grep -v "function sanitizeSystemNoteSubstring"` → 6 hits
  (compact-transcript.ts:396, system-note.ts:123/146/156/170, argument-echo.ts:118).
  None is on the transport path.

## Why this is a problem

The line-discipline in the anchor clause is the load-bearing format of every
binder note. Rule 1 keeps the note on one line. Rule 3 says the
prefix/suffix boundary "is part of the contract so a downstream renderer knows
which span it can trust" (defaulting-system-note-echo.md:20). The consumer that
breaks is the user-facing `theta-system-note` (`display: true`) that
`#emitBinderFailureNote` sends (src/extension/binder-run.ts:879-884). Bug 0087
§Why it matters states the same harm for the echo. Among the renderers of this
row family, the transport arm is the only one that does not apply rule 1. Any
line break in a provider `errorMessage` or in a thrown value's `.message`
therefore reaches that note unchanged. The rule-2 cap alone does not remove
the line break (confirmed by the scratch check above).

## Suggested direction (non-binding, optional)

Apply `sanitizeSystemNoteSubstring` to the transport arm's runtime-supplied
`<message>` before the rule-2 cap, the same way `renderCustomTypeUnsafeNote`
does, and add a line-break case to the transport-row cell in
tests/binder-retry-taxonomy.test.ts.

## False-positive check

- **EXST-9 / PIC-73 class check:** neither applies. This is a renderer's output
  format, not a sink or producer-hook throw at the bus boundary, and not a
  degrade-silent optional capability.
- **allow-broad-catch token check:** no catch is among the divergence sites. The
  catch at binder-run.ts:643 (`// allow-broad-catch: pi-sdk-boundary`) produces
  the thrown message, but the divergence is in how the renderer handles that
  message, not in the catch.
- **Stated-rationale check:** the renderer's doc comment
  (retry-taxonomy.ts:79-84) explains only why the transport and cancelled rows
  skip the em-dash grammar ("do not use the em-dash boundary, so they are
  composed directly and passed through the rule-2 length cap"). That is a rule-3
  rationale. It gives no reason for skipping rule 1. The spec calls the
  classifier message "rendered verbatim whenever it is non-empty"
  (determinism-cancellation-failure.md:42). In context that wording contrasts
  the provider text with the `"provider transport failure"` fallback. It does
  not exempt the row from rule 1: the same arm already changes the text by
  applying the rule-2 cap, and the `<ajv-summary>` and `<value>` placeholders
  are also "verbatim" validator/runtime content yet are rule-1 sanitised.
  docs/bugs/0198 (which set the classifier-message selection) does not mention
  line breaks or rule 1 (`grep -n -i "rule 1\|rule-1\|single.line\|newline\|sanitis\|sanitiz"`
  on it → 3 hits, none about the note's line discipline). Bug 0087 is the
  ruling that states the intended posture.
- **Sibling-reality check:** all four renderers are live production paths.
  `renderBinderSystemNote` is called at binder-run.ts:879.
  `renderCustomTypeUnsafeNote` is called at binder-run.ts:852. The transport
  outcomes are built at binder-run.ts:339, :647, :658 and :735
  (`grep -n 'kind: "transport"' src/extension/binder-run.ts`).
- **Test pin check:** the only offline cell for the transport row
  (tests/binder-retry-taxonomy.test.ts:211-224) uses the break-free message
  `"503 upstream unavailable"`. No test found asserts a preserved line break in
  the transport row (`grep -rn -A6 'kind: "transport"' tests/binder-retry-taxonomy.test.ts tests/binder-forced-tool-dispatch.test.ts | grep 'message:.*\\n'` → 0 hits).
- **Already-filed check:** resolved PTQ-0285 fixed the rule-1/rule-2 gap on
  `renderBinderFailureRow` (the needs_info/ambiguous rows in binder-envelope.ts).
  That is a different renderer and a different row, and it does not cover the
  transport arm. No intake or issue file names the transport arm's rule-1 gap
  (`grep -rli "transport row\|transport arm\|renderBinderSystemNote" quality/`
  → hits only on PTQ-0285, PTQ-0290, PTQ-0424, PTQ-1101, PTQ-1185, a D4 intake
  and tmp notes, none about this).

## Triage
verdict: confirmed — re-verified: the transport arm (retry-taxonomy.ts:115-121) wraps the runtime-supplied `surface.message` in `capSystemNote` only, while `renderFailureNote` (system-note.ts:122-126, used by ajv_args/needs_info/ambiguous) and `renderCustomTypeUnsafeNote` (compact-transcript.ts:395-399) run `sanitizeSystemNoteSubstring` before the cap; neither producer applies rule 1 (binder-run.ts:649-658 uses the coerced thrown value as-is; :731-735 `summariseErrorField` returns strings unchanged, err-field-summary.ts:95-98); both greps reproduce (5 capSystemNote / 6 sanitize hits, none on the transport path); the anchor defaulting-system-note-echo.md:16 says the rules apply "uniformly to every model-supplied or runtime-supplied substring", and determinism-cancellation-failure.md:42 classes the transport `<message>` as runtime-derived (the "verbatim" wording there contrasts with the fallback, and the equally verbatim `<ajv-summary>` is sanitised); the consumer is the display:true note from #emitBinderFailureNote (binder-run.ts:879-884); the only transport test cell (binder-retry-taxonomy.test.ts:211-224) is break-free; no tracked issue covers this (PTQ-0285 fixed a different renderer). The class is really posture-divergence rather than text-drift, and the file was missing its `## Triage` heading, which triage added (triage: claude-opus-5-5)
