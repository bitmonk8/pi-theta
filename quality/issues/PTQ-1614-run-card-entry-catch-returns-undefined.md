---
id: PTQ-1614
title: The createRunCardRenderer entry-closure catch returns undefined (the card disappears), while its sibling RunCardComponent.render catch falls back to the static form for the same class of run-card render defect
lens: D6
status: open
verdict: confirmed
locations:
  - src/extension/execution-status/render/run-card-component.ts:346-348
  - src/extension/execution-status/render/run-card-component.ts:124-130
  - src/extension/execution-status/render/run-card-component.ts:86-88
  - src/extension/system-note-renderer.ts:59-73
sites: 4
fix_scope: module
d6_class: posture-divergence
d6_anchor: "PIC-21 (docs/spec_topics/pi-integration-contract/extension-bootstrap-and-per-theta.md#pic-21): \"On any internal failure the renderer MUST catch it within its own body and return a minimal `Component` that renders the raw `message.content` when `display === true`, or `undefined` when `display === false`.\""
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: a251f7ea964be26c0d5a904fcf27fa00016b2aa0
---

# The createRunCardRenderer entry-closure catch returns undefined (the card disappears), while its sibling RunCardComponent.render catch falls back to the static form for the same class of run-card render defect

## Observation
`run-card-component.ts` has two annotated catches. Both cite "PIC-21 analogue" and both guard the same `theta-run` entry renderer against internal throws. The component's `render(width)` catch falls back to the D3 static compact form (`#renderStatic`). The renderer entry closure's catch (`createRunCardRenderer`) returns `undefined`. At the pinned host, `CustomEntryComponent.rebuild()` treats a falsy renderer return as "no content": it returns early, so the transcript entry draws nothing. A throw on the entry leg therefore makes the card vanish, while a throw on the render leg degrades to the static card. The same module states that the static renderer is where "every degradation path lands". PIC-21, the clause both catches cite, says a caught internal failure returns a minimal `Component` that renders the raw content when the note is displayed.

## Evidence
**Divergent side.** `src/extension/execution-status/render/run-card-component.ts:346-348` (inside `createRunCardRenderer`, lines 325-350):
```ts
    } catch { // allow-broad-catch: PIC-21 analogue — a renderer must never throw on a malformed payload
      return undefined;
    }
```
The try body (327-345) already has a non-throwing degradation route. On a missing seed, theme, bus track or clock it calls `return deps.staticFallback(entry, options, theme);` at line 336, which is the static form.

**Sibling side, same file, same class.** `src/extension/execution-status/render/run-card-component.ts:124-130`:
```ts
  render(width: number): string[] {
    try {
      return this.#renderLive(width);
    } catch { // allow-broad-catch: PIC-21 analogue — a render defect degrades to the static form, never unwinds pi-tui's render loop
      return this.#renderStatic(width);
    }
  }
```
`#renderStatic` (134-139) calls `this.#deps.staticFallback(...)`.

**The module's stated degradation target.** `src/extension/execution-status/render/run-card-component.ts:86-88`:
```ts
  readonly ensureLut: (theme: CardThemeSurface) => readonly string[];
  /** The D3 static compact renderer every degradation path lands on. */
  readonly staticFallback: ThetaRunEntryRenderer;
```

**What `undefined` means at the host.** `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/custom-entry.js:35-46`:
```js
        try {
            component = this.renderer(this.entry, { expanded: this._expanded }, theme);
        }
        catch (error) {
            ...
            component = box;
        }
        if (!component) {
            return;
        }
```
The entry catch converts a throw, which the host would show as a visible `renderer failed` box, into an empty entry.

**Anchor-side sibling (the PIC-21 renderer itself).** `src/extension/system-note-renderer.ts:59-73`:
```ts
  try {
    if (display === false) {
      return undefined;
    }
    const lines = formatLines ? formatLines(content) : content.split("\n");
    return textComponent(lines);
  } catch (e: unknown) { // allow-broad-catch: PIC-21 — runtime-event-channel.md / extension-bootstrap-and-per-theta.md#pic-21
    // PIC-21: trap any internal renderer-body failure. `display === false`
    // still renders nothing; otherwise fall back to the raw content lines.
    void e;
    if (display === false) {
      return undefined;
    }
    return textComponent(content.split("\n"));
  }
```

**Anchor, quoted verbatim** from docs/spec_topics/pi-integration-contract/extension-bootstrap-and-per-theta.md:47 (PIC-21): "On any internal failure the renderer MUST catch it within its own body and return a minimal `Component` that renders the raw `message.content` when `display === true`, or `undefined` when `display === false`."

**Why these are siblings (mechanical argument).** Both catches sit in one module, wrap the one registered `theta-run` entry renderer, catch the same class (an internal throw while producing that entry's rendering), and carry the same token family (`PIC-21 analogue`). The system-note catch carries the `PIC-21` token itself, and it resolves the displayed case to a minimal content component. A `theta-run` card has no `display: false` case: PIC-75 says it is always a drawn transcript entry. So under the cited clause the displayed arm applies, and it asks for a minimal `Component`. The render-leg catch and the system-note catch both follow that. The entry-leg catch returns the hidden-case value instead.

Search: `grep -rn "allow-broad-catch: PIC-21" src` → 3 hits (run-card-component.ts:127, run-card-component.ts:346, system-note-renderer.ts:65). Only :346 resolves a caught throw to `undefined` for a displayed rendering.

## Why this is a problem
The one module has two different outcomes for the same failure class, and both catches cite the same clause. A defect on the entry leg removes the card from the transcript with no trace. The host's own guard would have shown a `[theta-run] renderer failed` box, and the render-leg sibling would have shown the static compact card. The anchor-side behaviour is written down in three places: the PIC-21 clause's displayed-case rule, the system-note renderer's catch, and this module's own doc line saying `staticFallback` is where "every degradation path lands".

## Suggested direction (non-binding, optional)
Align the entry-closure catch with its render-leg sibling: return the static compact form, still guarded, and use `undefined` only if the static renderer itself throws.

## False-positive check
- **EXST-9 / PIC-73 class check:** Neither catch wraps a sink call or producer hook on the bus boundary (EXST-9). Neither guards an optional host capability's absence or first hard failure (PIC-73). Both are renderer-body exception traps under the PIC-21 family, so the pre-exemptions do not apply. PIC-73 does cover the entry channel's registration and append (theta-run-entries.md:17: "a failed or degraded append of a run entry is a silent skip"), but that is the append path, not the renderer body.
- **allow-broad-catch token check:** :346 carries `PIC-21 analogue — a renderer must never throw on a malformed payload`, which names only the no-throw obligation. :127 carries `PIC-21 analogue — a render defect degrades to the static form`. system-note-renderer.ts:65 carries `PIC-21`. The token at :346 names the same clause family as its siblings, and that clause picks the minimal-component arm for a displayed rendering.
- **Stated-rationale check:** I read the comments at both sites and the module header, plus docs/spec_topics/pi-integration-contract/theta-run-entries.md (PIC-75 renderer semantics, line 19) and docs/rfcs/0015-theta-run-card.md §"Modes and degradation" (lines 194-203). None states that a caught entry-leg throw should hide the card. `grep -rln "run-card-component\|createRunCardRenderer\|renderer failed" docs/bugs docs/rfcs quality/issues` → 1 hit (docs/bugs/0490-completed-drive-run-card-freezes-in-running-form.md). Its only run-card-component mention (line 94) is about linger-based static degradation, not the entry catch. `git log -5 -- src/extension/execution-status/render/run-card-component.ts` shows 850b591b, f63d8449, c5a3d05a, and none of them states a rationale for `undefined`.
- **Sibling-reality check:** Both catches are live code in the same shipped renderer. `createRunCardRenderer` is the renderer `createRunCardController` injects (run-card-renderer.ts:241-248). The render-leg catch is on the component that closure constructs. `tests/execution-status-run-card-renderer.test.ts:142-148` asserts only `.not.toThrow()` for malformed payloads. Those payloads reach the static route at line 336, not the catch, so no test pins the `undefined` outcome.
- **Already-filed check:** No listed PTQ or pending candidate covers this catch. PTQ-1256 and PTQ-1260 concern snapshot cost and the controller decomposition.

## Triage
verdict: questionable — divergence verified; which posture is right needs a human ruling. All excerpts reproduce: run-card-component.ts:346-348 returns undefined, :124-130 falls back to #renderStatic, :86-88 has the doc line, system-note-renderer.ts:59-73 matches, custom-entry.js rebuild() returns early on a falsy component, and the stated grep finds 3 hits. But the anchor does not pin the right side. PIC-21 is written for the `theta-system-note` message renderer (raw `message.content`, `display` arms). PIC-71 carries over to entry renderers only the "MUST NOT throw out of the renderer invocation" obligation, and the :346 catch meets that. PIC-75 and RFC 0015 §"Modes and degradation" say nothing about what a caught entry-leg throw should return. Also, the same "PIC-21 analogue" token family resolves to render-nothing at entry-channel.ts:204 (a malformed milestone returns undefined) (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: align the createRunCardRenderer entry-closure catch (run-card-component.ts:346-348) to its render-leg sibling - the catch returns deps.staticFallback(entry, options, theme) under a nested guard, and undefined only when staticFallback itself throws; update the :346 allow-broad-catch token text to name the static-form degrade. Failure-path-only: the try body's existing :336 degrade route, the render-leg catch, and all payloads unchanged.
