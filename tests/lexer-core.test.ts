import { describe, expect, it } from "vitest";
import { lexTheta, type LexResult, type Token } from "../src/lexer/lexer";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import {
  SYSTEM_NOTE_CHANNEL,
  type SystemNoteChannelDeps,
  type SystemNoteDetails,
  type SystemNoteSender,
} from "../src/extension/system-note-channel";

// V1a-T — failing tests for the paired `V1a` lexer-core implementation.
//
// Spec: lexical.md (§Encoding, §"Newline normalisation", §Identifiers,
// §"Reserved keywords", §"Statement terminators", §Comments, §"Stray
// backslash") and grammar.md §"Newline continuation".
//
// Every lexer-surfaced diagnostic is asserted to fire through the V7d
// producer-facing diagnostic-emission seam (the `Deps. V7d` edge): the
// recording channel below captures the `theta-system-note` `details.diagnostics`
// the lexer delivers through `emitDiagnosticBatch` → `pi.sendMessage`, never a
// direct/out-of-band `pi.sendMessage` call. The diagnostic *Message* strings
// are sourced from the diagnostics registry (code-registry-load.md /
// code-registry-parse.md) per the *Diagnostic message anchors* rule.
//
// These tests red because the V1a tokeniser / encoding-validator / continuation
// engine is absent — `lexTheta` is an inert no-op returning an empty token
// stream and no diagnostics — so each test reds on its own primary assertion
// (empty token stream, wrong statement count, or no delivered diagnostic), not
// on a compile error, missing fixture, or harness throw.

// --- recording channel double (V7d seam) ---------------------------------

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

/** Lex a raw byte source (for the encoding path that precedes decoding). */
function lexBytes(bytes: Uint8Array): {
  result: LexResult;
  fixture: SeamFixture;
} {
  const fixture = seam();
  const result = lexTheta({ path: "test.theta", bytes }, fixture.deps);
  return { result, fixture };
}

/** Every diagnostic the lexer delivered through the V7d seam, flattened. */
function deliveredDiagnostics(fixture: SeamFixture): Diagnostic[] {
  return fixture.delivered.flat();
}

/**
 * Split a token stream into statement groups on the *significant* `stmt-sep`
 * tokens, dropping empty groups (so a leading/trailing newline or a blank line
 * never manufactures an empty statement). A single continued statement yields
 * exactly one group.
 */
function statementGroups(tokens: readonly Token[]): Token[][] {
  const groups: Token[][] = [];
  let current: Token[] = [];
  for (const t of tokens) {
    if (t.kind === "stmt-sep") {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
    } else if (t.kind !== "eof") {
      current.push(t);
    }
  }
  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

/** Comparable projection of a token stream (kind + text + span). */
function project(tokens: readonly Token[]): unknown[] {
  return tokens.map((t) => ({ kind: t.kind, text: t.text, range: t.range }));
}

// --- §Encoding — theta/load/invalid-encoding ------------------------------

describe("V1a-T — encoding validation", () => {
  it("theta/load/invalid-encoding: a non-UTF-8 byte fails load with this code at the byte offset, delivered through the V7d seam", () => {
    // "hi" (0x68 0x69) then a lone 0xFF at zero-based byte offset 2.
    const { result, fixture } = lexBytes(new Uint8Array([0x68, 0x69, 0xff]));

    expect(result.ok).toBe(false);

    const diags = deliveredDiagnostics(fixture);
    const encoding = diags.find(
      (d) => d.code === "theta/load/invalid-encoding",
    );
    expect(encoding, "theta/load/invalid-encoding delivered via V7d seam").toBeDefined();
    // Message + offset sourced from code-registry-load.md (`<offset>` = 2).
    expect(encoding?.message).toBe("invalid UTF-8 encoding at byte offset 2");
  });

  it("theta/load/invalid-encoding fires through the V7d seam (a batched theta-system-note), not a direct out-of-band pi.sendMessage", () => {
    const { fixture } = lexBytes(new Uint8Array([0xff]));
    // Delivery is via the producer-facing emitDiagnosticBatch → one
    // theta-system-note carrying the Diagnostic[] in details.diagnostics.
    expect(fixture.sent.length).toBeGreaterThan(0);
    for (const envelope of fixture.sent) {
      expect(envelope.customType).toBe(SYSTEM_NOTE_CHANNEL);
      expect("diagnostics" in envelope.details!).toBe(true);
    }
    const diags = deliveredDiagnostics(fixture);
    expect(diags.some((d) => d.code === "theta/load/invalid-encoding")).toBe(true);
  });
});

// --- §Newline normalisation — CRLF→LF ------------------------------------

describe("V1a-T — newline normalisation (CRLF→LF)", () => {
  it("lexical.md §Newline normalisation: LF and CRLF inputs tokenise to identical token streams", () => {
    const lf = lex("let x = 1\nlet y = 2\n").result;
    const crlf = lex("let x = 1\r\nlet y = 2\r\n").result;

    // The streams are non-empty (tokenisation present) and byte-identical
    // across line-ending styles — CRLF counts as one newline, not two.
    expect(lf.tokens.length).toBeGreaterThan(0);
    expect(project(crlf.tokens)).toEqual(project(lf.tokens));
  });
});

// --- §Reserved keywords / §Identifiers — parse-time case + keyword rules --

describe("V1a-T — identifier and keyword rules", () => {
  it("theta/parse/reserved-keyword-as-identifier: a reserved word in identifier position fires (via V7d seam)", () => {
    // `match` is a reserved keyword used here in binding (identifier) position.
    const { fixture } = lex("let match = 1");
    const d = deliveredDiagnostics(fixture).find(
      (x) => x.code === "theta/parse/reserved-keyword-as-identifier",
    );
    expect(d, "theta/parse/reserved-keyword-as-identifier").toBeDefined();
    // Message template `reserved keyword '<keyword>' …` from code-registry-parse.md.
    expect(d?.message).toBe(
      "reserved keyword 'match' cannot be used as an identifier",
    );
  });

  it("theta/parse/schema-case-mismatch: a lowercase-first schema name fires (via V7d seam)", () => {
    const { fixture } = lex("schema animal = Foo | Bar");
    const d = deliveredDiagnostics(fixture).find(
      (x) => x.code === "theta/parse/schema-case-mismatch",
    );
    expect(d, "theta/parse/schema-case-mismatch").toBeDefined();
    expect(d?.message).toBe("schema name must start with an uppercase letter");
  });

  it("theta/parse/binding-case-mismatch: an uppercase-first binding name fires (via V7d seam)", () => {
    const { fixture } = lex("let Foo = 1");
    const d = deliveredDiagnostics(fixture).find(
      (x) => x.code === "theta/parse/binding-case-mismatch",
    );
    expect(d, "theta/parse/binding-case-mismatch").toBeDefined();
    expect(d?.message).toBe(
      "binding name must start with a lowercase letter or _",
    );
  });
});

// --- §Comments — theta/parse/block-comment --------------------------------

describe("V1a-T — block comments rejected", () => {
  it("theta/parse/block-comment: a /* … */ block comment is rejected (via V7d seam)", () => {
    const { fixture } = lex("/* not supported */");
    const d = deliveredDiagnostics(fixture).find(
      (x) => x.code === "theta/parse/block-comment",
    );
    expect(d, "theta/parse/block-comment").toBeDefined();
    expect(d?.message).toBe("block comments are not supported");
  });
});

// --- §Statement terminators / §Stray backslash ---------------------------

describe("V1a-T — termination and continuation violations", () => {
  it("theta/parse/single-line-if: a single-line `if (x) stmt` body fires (via V7d seam)", () => {
    const { fixture } = lex("if (x) doThing()");
    const d = deliveredDiagnostics(fixture).find(
      (x) => x.code === "theta/parse/single-line-if",
    );
    expect(d, "theta/parse/single-line-if").toBeDefined();
    expect(d?.message).toBe("single-line body not permitted; wrap in { ... }");
  });

  it("theta/parse/stray-backslash: a backslash outside any literal fires (via V7d seam)", () => {
    // A lone backslash at top level — theta has no line-continuation marker.
    const { fixture } = lex("\\");
    const d = deliveredDiagnostics(fixture).find(
      (x) => x.code === "theta/parse/stray-backslash",
    );
    expect(d, "theta/parse/stray-backslash").toBeDefined();
    expect(d?.message).toBe("stray backslash in source");
  });
});

// --- grammar.md §Newline continuation — closed trigger table -------------

describe("V1a-T — newline continuation (closed trigger table, positive path)", () => {
  it("grammar.md §Newline continuation: an unmatched open bracket continues across the newline (one statement)", () => {
    const { result } = lex("let x = [\n  1, 2, 3\n]");
    expect(statementGroups(result.tokens)).toHaveLength(1);
  });

  it("grammar.md §Newline continuation: a trailing binary operator continues across the newline (one statement)", () => {
    const { result } = lex("let x = a +\n  b");
    expect(statementGroups(result.tokens)).toHaveLength(1);
  });

  it("grammar.md §Newline continuation: a trailing comma inside an open bracket continues across the newline (one statement)", () => {
    const { result } = lex("f(a,\n  b)");
    expect(statementGroups(result.tokens)).toHaveLength(1);
  });

  it("grammar.md §Newline continuation: a leading binary operator on the next line continues across the newline (one statement)", () => {
    const { result } = lex("let x = a\n  + b");
    expect(statementGroups(result.tokens)).toHaveLength(1);
  });
});

describe("V1a-T — newline continuation (blank-line-spanning rule)", () => {
  it("grammar.md §Newline continuation: blank lines do not break a trailing-trigger continuation (one statement)", () => {
    // `let x =\n\n  foo` is one statement equivalent to `let x = foo`.
    const { result } = lex("let x =\n\n  foo");
    expect(statementGroups(result.tokens)).toHaveLength(1);
  });

  it("grammar.md §Newline continuation: blank lines do not break a leading-operator continuation (one statement)", () => {
    // `let x = a\n\n  + b` continues across the blank line.
    const { result } = lex("let x = a\n\n  + b");
    expect(statementGroups(result.tokens)).toHaveLength(1);
  });
});
