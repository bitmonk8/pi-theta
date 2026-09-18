---
id: PTQ-0560
title: lexer-core.test.ts redeclares literals-and-paths.test.ts's SeamFixture recording double for the V7d diagnostic-emission seam
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/lexer-core.test.ts:33-86
  - tests/literals-and-paths.test.ts:44-81
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# lexer-core.test.ts redeclares literals-and-paths.test.ts's SeamFixture recording double for the V7d diagnostic-emission seam

## Observation
tests/lexer-core.test.ts declares a module-scope `SeamFixture` interface, a
`seam()` builder that stubs `SystemNoteSender.sendMessage` to record every
delivered `theta-system-note` diagnostics batch, a `lex(src)` driver, and a
`deliveredDiagnostics(fixture)` projector — labelled in its own comment
"recording channel double (V7d seam)". tests/literals-and-paths.test.ts
declares the same four names under the same comment heading, with the same
`SystemNoteSender`/`SystemNoteChannelDeps` shape and the same
`lexTheta({ path: "test.theta", ... }, fixture.deps)` call, differing only in
the extra `sent`/`lexBytes` members lexer-core.test.ts's encoding-path tests
need and the extra `deliveredCode` helper literals-and-paths.test.ts adds.
No shared helper under tests/helpers/ exports this double; every other
`SystemNoteChannelDeps` consumer in scope for this review
(tests/lex-drop-single-delivery.test.ts,
tests/lexer-parser-diagnostics-production.test.ts) wires an inert no-op
sink instead, so this recording-double shape is unique to this pair.

## Evidence
tests/lexer-core.test.ts:33-63:
```ts
interface SeamFixture {
  readonly deps: SystemNoteChannelDeps;
  /** Every batch the lexer delivered through the V7d `theta-system-note` seam. */
  readonly delivered: Diagnostic[][];
  /** Raw `sendMessage` envelopes, to pin batched single-send delivery. */
  readonly sent: Array<{ customType: string; details?: SystemNoteDetails }>;
}

function seam(): SeamFixture {
  const delivered: Diagnostic[][] = [];
  const sent: Array<{ customType: string; details?: SystemNoteDetails }> = [];
  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      sent.push({
        customType: message.customType,
        ...(message.details !== undefined ? { details: message.details } : {}),
      });
      if ("diagnostics" in message.details!) {
        delivered.push([...message.details!.diagnostics]);
      }
    },
  };
  const deps: SystemNoteChannelDeps = {
    pi,
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  return { deps, delivered, sent };
}

/** Lex a UTF-8 string source; return the lex result and the seam fixture. */
function lex(src: string): { result: LexResult; fixture: SeamFixture } {
  const fixture = seam();
  const result = lexTheta(
    { path: "test.theta", bytes: new TextEncoder().encode(src) },
    fixture.deps,
  );
  return { result, fixture };
}
```

tests/lexer-core.test.ts:84-86:
```ts
function deliveredDiagnostics(fixture: SeamFixture): Diagnostic[] {
  return fixture.delivered.flat();
}
```

tests/literals-and-paths.test.ts:42-81 (the counterpart — identical
`SeamFixture`/`seam()`/`lex()`/`deliveredDiagnostics()` shape, minus the
`sent` instrumentation and `lexBytes`, plus its own `deliveredCode`):
```ts
// --- recording channel double (V7d seam) ---------------------------------

interface SeamFixture {
  readonly deps: SystemNoteChannelDeps;
  readonly delivered: Diagnostic[][];
}

function seam(): SeamFixture {
  const delivered: Diagnostic[][] = [];
  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      const details: SystemNoteDetails = message.details!;
      if ("diagnostics" in details) {
        delivered.push([...details.diagnostics]);
      }
    },
  };
  const deps: SystemNoteChannelDeps = {
    pi,
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  return { deps, delivered };
}

/** Lex a UTF-8 string source; return the lex result and the seam fixture. */
function lex(src: string): { result: LexResult; fixture: SeamFixture } {
  const fixture = seam();
  const result = lexTheta(
    { path: "test.theta", bytes: new TextEncoder().encode(src) },
    fixture.deps,
  );
  return { result, fixture };
}

/** Every diagnostic the lexer delivered through the V7d seam, flattened. */
function deliveredDiagnostics(fixture: SeamFixture): Diagnostic[] {
  return fixture.delivered.flat();
}

/** The first delivered diagnostic carrying `code`, if any. */
function deliveredCode(fixture: SeamFixture, code: string): Diagnostic | undefined {
  return deliveredDiagnostics(fixture).find((d) => d.code === code);
}
```

Search: `grep -rln "interface SeamFixture" tests/*.test.ts` → exactly these
two files.

## Why this is a problem
Both files declare, under the identical comment heading
`// --- recording channel double (V7d seam) ---------------------------------`,
the same `SeamFixture` shape and the same `seam()`/`lex()`/
`deliveredDiagnostics()` trio wiring a `SystemNoteSender` stub to record every
`theta-system-note` batch the lexer emits. No `tests/helpers/` module exports
this double, so each file pays for and maintains its own copy of a fixture
that exists to model one seam (`SystemNoteChannelDeps`) both files exercise
identically.

## Suggested direction (non-binding, optional)
A shared tests/helpers/ module exporting the `SeamFixture` type and the
`seam()`/`lex()`/`deliveredDiagnostics()` trio is the natural home the shared
comment heading and identical shape already point at; each file's own extra
member (`sent`/`lexBytes` here, `deliveredCode` there) would stay local as
the part that varies.

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or the named gate kin; not
  a census/pin gate.
- Recording-double: `SeamFixture.delivered`/`sent` do record calls, but both
  files use the recording only to assert POSITIVE delivered-diagnostic
  content (`deliveredDiagnostics(fixture).find(...)`), never a MUST-NOT-be-
  called negative witness — the negative-witness carve-out protects the
  double's *use*, not a second from-scratch declaration of the same double
  in a sibling file.
- docs/bugs/ signature search: `grep -rn "SeamFixture\|lexer-core.test.ts\|literals-and-paths.test.ts" docs/bugs/` found no bug document discussing this harness duplication.
- coverage-matrix/bug-doc citation search: `grep -rn "lexer-core.test.ts\|literals-and-paths.test.ts" docs/reference/coverage-matrix.md` found no citation by name pinning either file's internal structure; this finding proposes no test rename/merge/delete.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every copy is already exercised by its own file's
  tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts match verbatim at the cited lines and `grep -rln "interface SeamFixture" tests/` returns exactly these two files; the `SeamFixture`/`seam()`/`lex()`/`deliveredDiagnostics()` trio is byte-identical apart from lexer-core's extra `sent` member, both files consume it only for positive `.find(...)` assertions through the V7d seam (so the negative-witness carve-out is moot), and no tests/helpers/ module exports a recording `SystemNoteSender` double (helpers/e2e-s1.ts's `lexSrc`/`lexBytes` wire an inert sink and cannot pin seam delivery); the three other "recording channel double" fixtures (query-discard, runtime-event-channel, system-note-channel) target different seams and never drive `lexTheta`; not a gate test, no merge/rename/delete of any bug-doc-cited cell proposed, and no existing PTQ row tracks this pair (PTQ-0077 names literals-and-paths.test.ts only as a D2 caller witness) — one peripheral claim is off (tests/lex-drop-single-delivery.test.ts records `pi.sendMessage` envelopes via composeExtensionInstance rather than wiring an inert sink) but it does not bear on the root cause (triage: claude-fable-5-1)
