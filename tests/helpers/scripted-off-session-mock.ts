// Opt-in scripted off-session complete() mock and per-test reset lifecycle.
// Import before production modules (including helpers that import them) so the
// mock is installed before pi-ai is loaded. Kept separate from the general
// scripted-live-session harness, whose callers also supply other mock shapes.
import { afterEach, beforeEach, vi } from "vitest";

// The scripted off-session binder reply. `vi.hoisted` so the `vi.mock` factory
// (hoisted above the imports) can close over a mutable holder each test sets.
// `replyFor` scripts the reply as a FUNCTION of the captured call so a ToolCall
// reply can name whatever binder tool production actually attached.
const scripted = vi.hoisted(() => ({
  replyFor: undefined as undefined | ((context: unknown) => unknown),
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export (types, helpers) passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (_model: unknown, context: unknown) =>
      scripted.replyFor?.(context),
    ),
  };
});

export { scripted };

beforeEach(() => {
  scripted.replyFor = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});
