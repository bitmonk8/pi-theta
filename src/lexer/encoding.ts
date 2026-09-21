// Shared raw-byte UTF-8 validation gate, plus lexer decoding and newline normalisation.

import { type Diagnostic } from "../diagnostics/diagnostic";
import {
  emitDiagnosticBatch,
  type SystemNoteChannelDeps,
} from "../extension/system-note-channel";

/**
 * UTF-8 validation against the raw, pre-normalisation bytes, so the
 * first-invalid-byte offset is observable (lexical.md §Encoding). A non-UTF-8
 * BOM faults on its own leading byte, yielding offset 0 per the spec.
 * Emit and return the refusal diagnostic, or `undefined` for valid bytes.
 */
export function validateUtf8Encoding(
  bytes: Uint8Array,
  file: string,
  deps: SystemNoteChannelDeps,
): Diagnostic | undefined {
  const invalidOffset = firstInvalidUtf8Offset(bytes);
  if (invalidOffset >= 0) {
    const encodingDiag: Diagnostic = {
      severity: "error",
      code: "theta/load/invalid-encoding",
      file,
      message: `invalid UTF-8 encoding at byte offset ${invalidOffset}`,
    };
    emitDiagnosticBatch([encodingDiag], deps);
    return encodingDiag;
  }
  return undefined;
}

/**
 * Return the zero-based byte offset of the first byte that breaks UTF-8
 * well-formedness (including lone surrogates and overlong-range continuation
 * bytes), or `-1` when the whole sequence is valid UTF-8. A valid leading
 * UTF-8 BOM (`EF BB BF`) is itself well-formed UTF-8 and passes.
 *
 * Exported (bug 0410 §Fix option 1) so `parseThetaDocument`
 * (`../parser/theta-document.ts`) can run this same validator over raw
 * pre-decode bytes: that whole-document path otherwise decodes with a
 * non-fatal `TextDecoder` before the lexer gate (`lexTheta` in `./lexer.ts`)
 * ever sees the bytes, so re-encoded, always-valid text reaches the gate and
 * `theta/load/invalid-encoding` never fires on the shipped pipeline.
 */
export function firstInvalidUtf8Offset(bytes: Uint8Array): number {
  const n = bytes.length;
  let i = 0;
  while (i < n) {
    const b = bytes[i];
    if (b === undefined) {
      break;
    }
    if (b < 0x80) {
      i += 1;
      continue;
    }
    let needed: number;
    let firstLo = 0x80;
    let firstHi = 0xbf;
    if (b >= 0xc2 && b <= 0xdf) {
      needed = 1;
    } else if (b === 0xe0) {
      needed = 2;
      firstLo = 0xa0;
    } else if (b >= 0xe1 && b <= 0xec) {
      needed = 2;
    } else if (b === 0xed) {
      needed = 2;
      firstHi = 0x9f; // exclude the UTF-16 surrogate range
    } else if (b === 0xee || b === 0xef) {
      needed = 2;
    } else if (b === 0xf0) {
      needed = 3;
      firstLo = 0x90;
    } else if (b >= 0xf1 && b <= 0xf3) {
      needed = 3;
    } else if (b === 0xf4) {
      needed = 3;
      firstHi = 0x8f;
    } else {
      // Invalid lead byte: 0xC0/0xC1, a bare continuation 0x80–0xBF, or
      // 0xF5–0xFF. The first invalid byte is this lead byte.
      return i;
    }
    for (let k = 1; k <= needed; k += 1) {
      const cb = bytes[i + k];
      if (cb === undefined) {
        // Truncated multibyte sequence at EOF: the sequence begins invalid.
        return i;
      }
      const lo = k === 1 ? firstLo : 0x80;
      const hi = k === 1 ? firstHi : 0xbf;
      if (cb < lo || cb > hi) {
        return i + k;
      }
    }
    i += needed + 1;
  }
  return -1;
}

export { decodeUtf8, normaliseNewlines };

/** Decode validated UTF-8 bytes, skipping a leading UTF-8 BOM. */
function decodeUtf8(bytes: Uint8Array): string {
  const hasBom =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf;
  const body = hasBom ? bytes.subarray(3) : bytes;
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(body);
}

/** Normalise `\r\n` and bare `\r` to `\n` (lexical.md §Newline normalisation). */
function normaliseNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
