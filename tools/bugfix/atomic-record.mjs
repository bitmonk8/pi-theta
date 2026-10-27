/** Immutable JSON evidence: absent until complete, and never replaced.
 *
 * A same-directory private file is written, fsynced and closed before link(2)
 * publishes the final name atomically with no-clobber semantics. Unsupported
 * hard links/directory fsync fail closed; there is no overwriting-rename or
 * direct-final-write fallback. The caller must create the parent directory.
 *
 * SIGKILL before publication can leave a private .tmp file (not a journal).
 * An error/crash after link can leave a complete final record even though this
 * call did not succeed. Retain that evidence and treat the operation as
 * uncertain, not as permission to overwrite it or infer execution settlement.
 */
import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, linkSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * @param {string} path Final, single-use record name; existing names refuse.
 * @param {unknown} value JSON-serializable record.
 * @returns {void} Only returns after file and directory durability barriers.
 */
export function atomicImmutableJson(path, value) {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) throw new TypeError('Immutable record must be JSON-serializable');
  const directory = dirname(path);
  const temporary = join(directory, `.${basename(path)}.${randomUUID()}.tmp`);
  let fd = openSync(temporary, 'wx', 0o600);
  let privateExists = true;
  try {
    writeFileSync(fd, serialized + '\n');
    fsyncSync(fd);
    // Do not retry close after an error: the descriptor may already be closed.
    const closing = fd;
    fd = null;
    closeSync(closing);
    linkSync(temporary, path);
    unlinkSync(temporary);
    privateExists = false;
    const parent = openSync(directory, 'r');
    try { fsyncSync(parent); }
    finally { closeSync(parent); }
  } finally {
    try { if (fd !== null) closeSync(fd); }
    finally { if (privateExists) unlinkSync(temporary); }
  }
}
