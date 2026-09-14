// Shared scripted-live-session scaffold for the bug-0288/0319/0414 prompt-mode
// witnesses (PTQ-0328).
//
// WHY THIS FILE EXISTS. tests/b0288-prompt-turn-completion-witness.test.ts,
// tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts and
// tests/b0414-preabort-send-issued-witness.test.ts each drive the REAL
// prompt-mode binding (`createProductionProducerDeps` → `bindPromptConversation`
// → `executeBody`) against their own hand-built `ScriptedLiveSession` double,
// and each redeclared byte-for-byte the pieces that carry no cell-specific
// variation between them: the fixture model, the `SessionManager` entry shape,
// the in-flight-turn state shape, the entry-append pair, and the
// document-parsing / AJV factories. This module centralises those pieces only;
// each file's own `ScriptedLiveSession` behaviour (its `TurnScript` shape,
// `sendUserMessage` / `tick` / `isIdle`), `ctxDouble`, `driveLiveTheta` and
// clock choice stay local — that is where the three files' behaviour actually
// diverges.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module.

import { expect } from "vitest";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../../src/parser/theta-document";
import type { ThetaSource } from "../../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../../src/extension/system-note-channel";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../../src/seams/schema-validator";

/**
 * The user session's selected model (the bug-0288 fixture model). Distinct
 * `.api` / `.provider` strings (the bug-0009 fixture discipline) so a
 * synthesised `TransportError.provider` is checked against the API-shaped
 * value the PIC-50 derivation pins.
 */
export const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

/** A `SessionManager` message entry (the `buildSessionContext` read shape). */
export interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

/** An in-flight scripted turn: its script plus polls elapsed since the milestone. */
export interface TurnState<TScript> {
  readonly script: TScript;
  polls: number;
}

/** Append a `user` message entry (the scripted-session shape every lineage file shares). */
export function appendUserEntry(entries: SessionEntryDouble[], text: string): void {
  appendMessageEntry(entries, { role: "user", content: [{ type: "text", text }], timestamp: 0 });
}

/** Append an `assistant` message entry (the scripted-session shape every lineage file shares). */
export function appendAssistantEntry(
  entries: SessionEntryDouble[],
  text: string | undefined,
): void {
  appendMessageEntry(entries, {
    role: "assistant",
    content: text !== undefined ? [{ type: "text", text }] : [],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "m1",
    stopReason: "stop",
    timestamp: 0,
  });
}

/** Append one message entry, deriving its `id`/`parentId` from the existing chain. */
function appendMessageEntry(entries: SessionEntryDouble[], message: Record<string, unknown>): void {
  const id = `e${entries.length + 1}`;
  const parentId = entries.length === 0 ? undefined : `e${entries.length}`;
  entries.push({ type: "message", id, parentId, message });
}

/** Parse-theta-document deps whose seams are inert offline no-ops. */
export function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse `.theta` source through the production whole-file parser (must be clean). */
export function parse(src: string): ThetaDocument {
  const source: ThetaSource = { path: "probe.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/** The production AJV validator (matches the sibling live-seam harnesses). */
export function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}
