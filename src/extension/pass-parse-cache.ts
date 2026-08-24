// Bug 0264 — a pass-scoped parse cache + delivered-diagnostic claim set.
//
// `lexTheta` hands its diagnostics to the V7d producer seam
// (`emitDiagnosticBatch`, `src/lexer/lexer.ts`) and returns them; every walk
// that calls `parseThetaDocument` on a file already parsed in this compose
// pass therefore causes a second lexer emit of the same rows. Bug 0255's
// `ThetaDocument.deliveredDiagnostics` + identity filter (untouched here,
// `src/parser/theta-document.ts`) stops a re-DELIVERY of one already-parsed
// document's rows at the ONE site that re-tests them; it cannot stop a
// re-PARSE, because a fresh `parseThetaDocument` call mints fresh `Diagnostic`
// objects — an identity filter downstream of a second parse has nothing of
// the first parse's identity left to compare against.
//
// So this module pairs two operations, neither sufficient alone:
//   - `parse` memoises `parseThetaDocument` for one pass, keyed by the
//     separator-normalised absolute path, so a file already parsed this pass
//     is returned from cache and `lexTheta` never re-emits for it (route 1
//     fires once by construction). A cache HIT still requires byte-identical
//     `bytes`: a mid-pass file change (a discovery walk plus a subsequent
//     watcher-driven re-read of the same path within one pass) must re-parse,
//     never serve a stale document.
//   - `claimUndelivered` covers the walks that do NOT reach this module's
//     `parse` — the import-check drop group reads a parsed library's
//     `document.diagnostics` and re-delivers the registration-error subset
//     into its own returned group, which `runComposePass` then emits via
//     `sink.emitGroup`. That is a second EMIT of an already-parsed
//     document's diagnostics, not a second parse, so the parse cache alone
//     cannot see it: `claimUndelivered` tracks by object identity (a `Set`,
//     never a code-prefix test — `theta/parse/*` spans both the lex and parse
//     phases) which diagnostics have already reached the channel this pass —
//     seeded from every parse's `document.deliveredDiagnostics` — and returns
//     only the remainder a caller may still emit.
//
// Pass-scoped, explicitly injected (no global/static/singleton): one instance
// per `composeExtensionInstance` pass, created and threaded by the caller
// through `parseDeps` — which the H8b `parseCallee` closure (`runComposePass`)
// also captures, so this same instance keeps serving dispatch-time parses of
// byte-identical files after the pass that built it has finished walking.
// That is why `createPassParseCache` must be called fresh on every
// `runComposePass` invocation (initial and watcher-triggered reload): a reload
// gets its own empty cache, so it re-parses and re-delivers, which is the
// re-emission diagnostic-shape.md §Re-scan deduplication licenses across
// passes. The byte-identity hit test means no document from a changed file is
// ever served stale.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { ThetaSource } from "../lexer/lexer";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../parser/theta-document";

/** Separator-normalise an absolute path so a Win32 and a POSIX spelling key together. */
function normaliseCacheKey(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Byte-for-byte comparison — a cache HIT never serves a document for changed bytes. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/** One pass's memoised parse: the exact bytes it was parsed from, plus the result. */
interface CachedParse {
  readonly bytes: Uint8Array;
  readonly document: ThetaDocument;
}

/**
 * A pass-scoped parse memoiser plus delivered-diagnostic claim set. Both
 * operations are explicit dependencies, injected once per compose pass — see
 * the module doc-comment for why neither suffices alone.
 */
export interface PassParseCache {
  /**
   * Return the memoised parse of `input.path` (normalised) when the last
   * parse at this path used byte-identical `input.bytes`; otherwise parse via
   * `parseThetaDocument`, cache the result under the normalised path, and seed
   * the delivered-set with the fresh document's `deliveredDiagnostics` (the
   * rows `lexTheta` already put on the channel for this parse).
   */
  parse(input: ThetaSource, deps: ParseThetaDocumentDeps): ThetaDocument;
  /**
   * From `diagnostics`, return — by object identity — the subset not yet
   * surfaced on the channel this pass, and record that subset as surfaced.
   * Calling this twice with an overlapping array claims the overlap only
   * once.
   */
  claimUndelivered(diagnostics: readonly Diagnostic[]): Diagnostic[];
}

/** Construct a fresh, empty pass-scoped cache. Create exactly one per compose pass. */
export function createPassParseCache(): PassParseCache {
  const byPath = new Map<string, CachedParse>();
  const surfaced = new Set<Diagnostic>();

  return {
    parse(input, deps) {
      const key = normaliseCacheKey(input.path);
      const cached = byPath.get(key);
      if (cached !== undefined && bytesEqual(cached.bytes, input.bytes)) {
        return cached.document;
      }
      const document = parseThetaDocument(input, deps);
      byPath.set(key, { bytes: input.bytes, document });
      for (const diagnostic of document.deliveredDiagnostics) {
        surfaced.add(diagnostic);
      }
      return document;
    },
    claimUndelivered(diagnostics) {
      const claimed: Diagnostic[] = [];
      for (const diagnostic of diagnostics) {
        if (!surfaced.has(diagnostic)) {
          claimed.push(diagnostic);
          surfaced.add(diagnostic);
        }
      }
      return claimed;
    },
  };
}

/**
 * `ParseThetaDocumentDeps` widened with the optional pass-cache field, so the
 * cache rides the same `parseDeps` object already threaded to every relevant
 * walk instead of a new parameter on six call sites. Absent (every
 * non-production / inert-channel caller): {@link parseViaPassCache} parses
 * directly, byte-identical to calling `parseThetaDocument` itself.
 */
export interface PassParseDeps extends ParseThetaDocumentDeps {
  readonly passParseCache?: PassParseCache;
}

/**
 * Route a production `parseThetaDocument` call through `deps.passParseCache`
 * when present; parse directly otherwise (bug 0264 §Fix constraint 4 — with
 * no pass-cache field the call is byte-identical to `parseThetaDocument`
 * itself).
 */
export function parseViaPassCache(input: ThetaSource, deps: PassParseDeps): ThetaDocument {
  return deps.passParseCache === undefined
    ? parseThetaDocument(input, deps)
    : deps.passParseCache.parse(input, deps);
}
