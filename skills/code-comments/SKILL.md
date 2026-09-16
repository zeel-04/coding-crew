---
name: code-comments
description: Use when writing or editing any Python or TypeScript code, or reviewing its comments, docstrings, or JSDoc. Enforces this project's comment rule — no comment by default; a comment exists only to say what the code cannot.
---

Code shows what happens. A comment's only job is to say what the code cannot: why, what a value means, or what must always stay true. So the default is no comment — write the code, then add one only if a reader would still have a question. Apply this to the lines you write or change; do not sweep a file for old comments unless asked.

## Five questions

A comment stays only if the answer to all five is yes. One that fails is fixed in the same change — delete, move, or rewrite it.

1. **Does it tell the reader something the code they see does not?** A docstring or JSDoc reader sees only the name, arguments, and types. A line comment's reader sees the lines around it. No → delete.
2. **Does it use different words than the name?** `# fetch the user record` above `get_user()` does not. No → delete.
3. **Does it add a fact or a reason?** A fact: a unit, a range, what `None` means, what must always stay true. A reason: why this way, what the goal is. No → delete.
4. **Is it where its reader is?** The caller reads the docstring or JSDoc. The next editor reads a line in the body. No → move it.
5. **Does the docstring leave out how the body works?** A cache key or a query workaround belongs in the body. No → move that line.

If a comment explains *what* the code does, fix the code instead — a better name or a smaller function. A comment that explains *why* stays; no rename can carry a reason.

## Delete on sight

| Kind | Example | Fix |
|---|---|---|
| Repeats the code or narrates steps | `# increment counter`, `# step 1: validate`, `# now save` | Delete |
| Explains an unclear name | `# u is the owner` | Rename `u` to `owner` |
| Commented-out code or change notes | `# old_fn(x)`, `// updated to use apiFetch` | Delete — git keeps history |
| Divider or bare group name | `# ---- helpers ----`, `// utils` | Delete — a blank line between groups is enough |
| Repeats a type or the signature | `id (int): The id`, `@param {string} name`, `@returns {User}` | Delete — Pyrefly and tsc check types. Keep the line only if the rest adds a fact |
| Docstring that only repeats the name | `"""Builds the query."""` on `_build_query()`, `"""Employee serializers."""` at the top of `employee_serializers.py` | Delete — a docstring stays only by question 3 |

These pass without asking:

- A short *why*: `// actions are public endpoints — never trust the caller`.
- A group label that says how the group is used: `// reads — awaited directly from Server Components`. One that only names the group (`# helpers`) is a divider.
- A TODO that says what is missing and why it waits: `# TODO: drop after migration 0042 lands`. A vague one (`# TODO: handle errors`) is unfinished work — do it now, or delete it.
- Tool directives: `# noqa`, `# type: ignore`, `# pyrefly: ignore`, `// eslint-disable-next-line`, `// @ts-expect-error`.

Everything else is decided by the five questions. In docs and skill examples, a file-path label on the first line of a code block (`# urls.py`) is fine; never put one inside a real file.

## Where a comment goes

- **Docstring / JSDoc.** Only what the name and types cannot say: a limit, a side effect, an error it raises, what `None` or an empty list means, a timeout the caller must plan for. A well-named, typed function usually needs none — selectors ([[django-services]]) and `api.ts` functions ([[frontend-api-layer]]) included. Never add one to look complete, and never write filler to satisfy a docstring lint rule — disable the rule instead.
- **Line comment.** Why this branch, why this order, why this odd number. Put it on or directly above the line it explains, so it changes when the code does. Do not repeat a project convention at every site (the try/except arm order, `full_clean()` before `save()`) — the rule lives in the skill that sets it, not in every file.
