---
name: graphify
description: Query the project's graphify knowledge graph for codebase-wide questions — impact analysis, tracing what connects two concepts, or explaining a component across code, docs, and SQL.
---

Graphify builds a knowledge graph of the codebase at `graphify-out/graph.json` (a session-start hook keeps it fresh). Query it with the CLI:

```bash
graphify query "what depends on the invoice service?"   # semantic search
graphify path "UserSerializer" "PaymentModel"           # connection path between two concepts
graphify explain "EnrollmentService"                    # explain a concept in context
```

Build or refresh manually when needed:

```bash
graphify . --code-only            # full build (output in graphify-out/)
graphify . --code-only --update   # re-extract only changed files
```

`--code-only` uses the local tree-sitter AST and needs no API key. Without it, graphify requires an LLM key (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, …) as soon as the repo contains docs or images, and sends those files to that provider — only drop the flag when the user explicitly wants docs indexed.

Fallbacks:
- CLI missing → tell the user to run `pip install graphifyy` (or `uv tool install graphifyy`).
- No `graphify-out/graph.json` → run `graphify .` first, then query.
