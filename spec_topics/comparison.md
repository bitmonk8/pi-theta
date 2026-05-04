# Comparison with Existing Pi Features

| Feature | Pi `prompt` | Pi `subagent` | `pi-loom` |
|---|---|---|---|
| Instructions for | model | model (isolated) | code + model (boundary) |
| Logic/control flow | None | None | Full (loops, conditionals, functions) |
| Parameterization | YAML frontmatter | YAML frontmatter | Typed params + schemas |
| Type system | Untyped strings | Untyped strings | JSON / JSON Schema |
| Conversation context | Current | New (isolated) | Either (mode-controlled); loom drives N turns inside it |
| Output | Injected text | Injected text | Multi-turn conversation drive; loom return value (Rust-style last-expression) |
| Callable set | Tools (model only) | Tools (model only) | Unified callable set, addressable from both the model (in queries) and code (`<name>(...)`); accepts Pi tools and registered subagent looms |
| File format | Markdown `.md` | Markdown `.md` | Loom `.loom` (+ `.warp` library files) |
