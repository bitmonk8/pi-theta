// Bug 0342 — a `.theta` enum value forwarded UP a multi-hop invoke chain is
// attributed to the IMMEDIATE callee, not to its declaring file
// (`docs/bugs/0342-multi-hop-subagent-chain-attributes-forwarded-enum-to-immediate-callee.md`).
//
// THIS FILE IS THE OFFLINE ATTACH-LEG CONTROL, not the red witness. The defect
// is specific to the PIC-59 subagent envelope (`serializeOkEnvelope` =
// `JSON.stringify`, `subagent-envelope.ts:153`), which collapses a boxed enum
// carrier to its bare wire string and forces the next hop's decode to retag from
// the only path it has — the immediate callee's. The IN-PROCESS attach leg has
// no such boundary: the invoke-return decode reattaches a tag only at a
// named-enum position whose value is a bare wire string
// (`wire-translation.ts:325`–`:331`, `typeof value === "string"`), and a
// forwarded value arrives as an already-boxed carrier (`typeof === "object"`),
// so it passes through with its DEEPER declaring key intact
// (`surfaceCalleeFinalValue`, `production-theta-producer.ts:4070`, returns the
// carrier unchanged). The attach leg therefore already answers correctly at the
// fork, at depth ≥ 2.
//
// WHY IT IS HERE. The 0342 fix must repair the subagent leg to AGREE with this
// leg WITHOUT changing this leg (0342 §Fix: "the one-hop behaviour bug 0337
// landed must stay byte-identical … only a FORWARDED value gains its deeper
// declaring key"). These two cells are the deterministic, offline reference the
// subagent-leg witness (`b0342-forwarded-enum-subagent-chain.test.ts`,
// integration) is measured against for mode invariance, and the regression fence
// that a fix restoring declaring keys after decode must not break the attach
// leg's already-correct depth-2 forwarding. GREEN at the fork and GREEN after
// the fix.
//
// WHY THIS TIER (UNIT, offline, provider-free). The attach leg settles inside
// one `parseThetaDocument` + `bindPromptConversation` + `executeBody` over the
// real production producer (the b0337 `driveCaller` harness, extended here to
// serve MULTIPLE callees by their literal invoke path so a chain A→B→C runs
// in-process). No process boundary is reached, so no spawn is needed; the
// subagent leg's envelope boundary, which a unit tier cannot reach through the
// real invoke path, is what the sibling integration file covers.

import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import { parseThetaDocument, type ThetaDocument } from "../src/parser/theta-document";
import { executeBody } from "../src/runtime/statement-executor";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";

const PROMPT_FM = "---\nmode: prompt\n---\n";

/** The two-variant declaration every fixture reuses; explicit wire values so the collision is on the tag alone. */
const SEV_DECL = 'enum Sev { Low = "low", High = "high" }\n';

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function parseDepsLocal(): Parameters<typeof parseThetaDocument>[1] {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse a fixture and fail LOUDLY on any error-severity diagnostic (*No silent test skipping*). */
function parseTheta(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDepsLocal());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `precondition unmet: fixture ${path} failed to parse — ` +
        `${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}

/** The production AJV validator with the shipped `JSON.stringify` content-addressing, for the `invoke<T>` return gate. */
function realAjvValidator(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    schemaValidator: realAjvValidator(),
  } as unknown as RuntimeRoot;
}

/**
 * Drive a prompt-mode caller in-process, serving SEVERAL prompt-mode callees by
 * their literal invoke path. This extends the b0337 `driveCaller` harness so a
 * chain A→B→C runs entirely through the prompt→prompt ATTACH cell
 * (`production-theta-producer.ts:3763`): when B's body invokes `"./c.theta"` it
 * reaches the SAME production producer's `parseCallee`, which dispatches on the
 * literal path (`expr.path` from the `invoke<T>("./…")` site,
 * `production-theta-producer.ts:3579`, threaded as `calleePath` to `parseCallee`
 * at `:3728`) to serve the right callee. The
 * distinct `sourcePath`s are what make each file's `enum Sev` resolve to its own
 * declaring key.
 *
 * Returns the JSON projection of the caller's tail value — the `==` booleans and
 * wires the caller computed.
 */
async function driveAttachChain(input: {
  readonly callerPath: string;
  readonly callerSrc: string;
  readonly callees: ReadonlyArray<{ readonly literal: string; readonly path: string; readonly src: string }>;
}): Promise<unknown> {
  const byLiteral = new Map(input.callees.map((c) => [c.literal, c]));
  const parseCallee = (
    _callerPath: string | undefined,
    calleePath: string,
  ): Promise<ThetaCompositionInput> => {
    const callee = byLiteral.get(calleePath);
    if (callee === undefined) {
      // A callee the caller never declared reaching here is a harness bug,
      // surfaced loudly rather than served a silent default.
      return Promise.reject(
        new Error(`precondition unmet: parseCallee asked for an unknown callee literal '${calleePath}'`),
      );
    }
    const doc = parseTheta(callee.path, callee.src);
    return Promise.resolve({
      slashName: "callee",
      sourcePath: callee.path,
      frontmatter: doc.frontmatter as ParsedFrontmatter,
      body: doc.body,
    });
  };

  const deps = createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
    parseCallee,
  });

  const callerDoc = parseTheta(input.callerPath, input.callerSrc);
  const theta: ThetaCompositionInput = {
    slashName: "caller",
    sourcePath: input.callerPath,
    frontmatter: callerDoc.frontmatter as ParsedFrontmatter,
    body: callerDoc.body,
  };
  const binding = deps.bindPromptConversation({
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  });
  const execution = await executeBody(theta.body, binding.executeDeps);
  if (execution.outcome !== "success") {
    throw new Error(
      `precondition unmet: the caller body ended '${execution.outcome}' instead of reaching its ` +
        `tail — ${JSON.stringify(execution.error)}`,
    );
  }
  const value = execution.result.value;
  if (value === undefined) {
    throw new Error("precondition unmet: the caller body produced no tail value");
  }
  return JSON.parse(JSON.stringify(value)) as unknown;
}

/** Declaring file C: tails its own `Sev.Low`. */
const C_SRC = PROMPT_FM + SEV_DECL + "Sev.Low\n";

// ---------------------------------------------------------------------------
// A1 — DIRECTION 1 (false-negative reference). A→B→C, all prompt, in-process.
// B forwards C's value; A also obtains C's value directly. The forwarded value
// is still C's declaration, so it equals a value obtained directly from C.
// ---------------------------------------------------------------------------

describe("bug 0342 attach-leg control (A1) — a value forwarded through B equals a value obtained directly from C", () => {
  it("green now and after: fwd == direct is TRUE (the forwarded value keeps C's declaring key in-process)", async () => {
    const callerSrc =
      PROMPT_FM +
      SEV_DECL +
      "schema Rep { fok: boolean, dok: boolean, fwdEqDirect: boolean, fwdWire: Sev, directWire: Sev }\n" +
      'let rf = invoke<Sev>("./b.theta")\n' +
      'let rd = invoke<Sev>("./c.theta")\n' +
      "let fok = match rf { Ok(v) => true, Err(e) => false }\n" +
      "let dok = match rd { Ok(v) => true, Err(e) => false }\n" +
      "let fwd = match rf { Ok(v) => v, Err(e) => Sev.High }\n" +
      "let direct = match rd { Ok(v) => v, Err(e) => Sev.High }\n" +
      "Rep { fok: fok, dok: dok, fwdEqDirect: fwd == direct, fwdWire: fwd, directWire: direct }\n";
    // B forwards C: `let x = invoke<Sev>("./c.theta")?` then tails `x`.
    const bSrc = PROMPT_FM + SEV_DECL + 'let x = invoke<Sev>("./c.theta")?\nx\n';

    const report = (await driveAttachChain({
      callerPath: "/theta/a.theta",
      callerSrc,
      callees: [
        { literal: "./b.theta", path: "/theta/b.theta", src: bSrc },
        { literal: "./c.theta", path: "/theta/c.theta", src: C_SRC },
      ],
    })) as { fok: boolean; dok: boolean; fwdEqDirect: boolean; fwdWire: unknown; directWire: unknown };

    // Preconditions: both invokes returned Ok. A false here would read the
    // equality from the `Sev.High` fallback, so the assertion below could pass
    // for the wrong reason.
    expect(report.fok, "precondition: invoke of B (the forwarding callee) returns Ok").toBe(true);
    expect(report.dok, "precondition: invoke of C (the direct callee) returns Ok").toBe(true);

    // The attach leg is not broken (0342 §Fix constraint): the value C declares
    // and B forwards keeps C's declaring key in-process, so it compares equal to
    // a value obtained directly from C. The subagent-leg witness pins that the
    // spawn path must come to answer the same.
    expect(
      report.fwdEqDirect,
      "a forwarded value keeps its declaring file's identity, so it equals a direct-from-C value (0342 §Expected)",
    ).toBe(true);

    // The identity holds while the wire is preserved on both paths.
    expect(report.fwdWire, "the forwarded variant's wire value is preserved across two attach hops").toBe("low");
    expect(report.directWire, "the direct variant's wire value is preserved").toBe("low");
  });
});

// ---------------------------------------------------------------------------
// A2 — DIRECTION 2 (false-positive reference) + COMPOSITE reach. B returns a
// composite so B's OWN declaration and C's forwarded value sit side by side.
// B's own Sev.Low and C's forwarded Sev.Low are DIFFERENT declaring files, so
// `own == fwd` is FALSE — exercising the object-field (composite) reach.
// ---------------------------------------------------------------------------

describe("bug 0342 attach-leg control (A2) — B's own Sev.Low and C's forwarded Sev.Low are different declarations", () => {
  it("green now and after: own == fwd is FALSE inside a composite (the object-field reach)", async () => {
    const callerSrc =
      PROMPT_FM +
      SEV_DECL +
      "schema Pair { own: Sev, fwd: Sev }\n" +
      "schema Rep { pok: boolean, ownEqFwd: boolean, ownWire: Sev, fwdWire: Sev }\n" +
      'let rp = invoke<Pair>("./b.theta")\n' +
      "let pok = match rp { Ok(v) => true, Err(e) => false }\n" +
      "let own = match rp { Ok(v) => v.own, Err(e) => Sev.High }\n" +
      "let fwd = match rp { Ok(v) => v.fwd, Err(e) => Sev.High }\n" +
      "Rep { pok: pok, ownEqFwd: own == fwd, ownWire: own, fwdWire: fwd }\n";
    // B declares its own Pair, invokes C, and tails `Pair { own: Sev.Low, fwd: c }`.
    const bSrc =
      PROMPT_FM +
      SEV_DECL +
      "schema Pair { own: Sev, fwd: Sev }\n" +
      'let c = invoke<Sev>("./c.theta")?\n' +
      "Pair { own: Sev.Low, fwd: c }\n";

    const report = (await driveAttachChain({
      callerPath: "/theta/a.theta",
      callerSrc,
      callees: [
        { literal: "./b.theta", path: "/theta/b.theta", src: bSrc },
        { literal: "./c.theta", path: "/theta/c.theta", src: C_SRC },
      ],
    })) as { pok: boolean; ownEqFwd: boolean; ownWire: unknown; fwdWire: unknown };

    // Precondition: the composite invoke returned Ok. A false would read both
    // fields from the `Sev.High` fallback (same declaring key → equal), which
    // would flip `ownEqFwd` for the wrong reason.
    expect(report.pok, "precondition: invoke<Pair> of the forwarding callee returns Ok").toBe(true);

    // B's own Sev.Low (B's declaring key) and C's forwarded Sev.Low (C's
    // declaring key, preserved in-process) are different declarations, so the
    // composite's two fields compare unequal — already correct on the attach leg
    // at depth 2, and the reference the subagent leg must match.
    expect(
      report.ownEqFwd,
      "B's own Sev.Low and C's forwarded Sev.Low are different declaring files → unequal (0342 §Expected)",
    ).toBe(false);

    // Both fields preserve the bare wire "low": the inequality is on identity,
    // not wire.
    expect(report.ownWire, "B's own field wire preserved").toBe("low");
    expect(report.fwdWire, "C's forwarded field wire preserved").toBe("low");
  });
});
