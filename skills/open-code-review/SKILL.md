---
name: open-code-review
description: Use when the user asks to review code, review their changes, review staged/unstaged work, or check a diff for issues before committing. Reviews the working tree (staged + unstaged + untracked) and reports line-level findings classified High/Medium — bugs, security, performance, quality, and violations of this plugin's convention skills. Applies fixes only on explicit consent.
---

Review the working tree the way a senior teammate would: read the whole file, not just the hunk; enforce this plugin's conventions, not just generic quality; report precisely; and never touch the code unless asked. Methodology adapted from [open-code-review](https://github.com/alibaba/open-code-review) (Apache-2.0), re-implemented natively — no CLI or extra configuration required.

## Step 1 — Gather the diff (workspace mode)

Review scope is always the current working tree:

```bash
git status --porcelain     # enumerate changed + untracked files
git diff                   # unstaged changes
git diff --cached          # staged changes
```

Read untracked files in full — they are part of the review. If the working tree is clean, say "Working tree is clean — nothing to review." and stop.

## Step 2 — Gather business context

Before judging code, understand what it is trying to do. Collect:

- The branch name and recent commit subjects (`git log --oneline -5`)
- Anything the user said about the intent of the changes

Use this context to judge whether the change accomplishes its purpose, not just whether each line is clean.

## Step 3 — Load the matching convention skills

Map every changed file to this plugin's skills and invoke each matching skill before reviewing, so findings enforce house conventions:

| Changed path | Skill(s) to invoke |
|---|---|
| `models.py` | django-models |
| `services/`, `selectors.py`, `tasks.py` | django-services |
| `views/`, `serializers/`, `urls.py` | django-apis |
| `exceptions.py`, custom exception handler | django-errors |
| tests, `test_data/`, `conftest.py` | django-testing |
| new app layout, `schema.py`, `types.py`, `permissions.py` | django-structure |
| `config/`, settings modules, env reads | django-settings |
| `lib/client.ts`, `lib/features/**/{api,schema,types}.ts` | frontend-api-layer |
| `lib/dal.ts`, `middleware.ts`, session reads, filter/pagination state | frontend-auth-and-state |
| screens, forms, tables, dialogs, components | design-patterns, design-foundations |
| UI copy — labels, errors, toasts, empty states | design-writing |
| `.mermaid` schema files | database-design |

Files that match nothing get a generic review only. Also check cross-file consistency the single-file skills can't see: naming mismatches between a service and its API, business logic leaked into a view or serializer, a new service with no test cases.

## Step 4 — Review each file

For every changed file, read the **full current file**, never just the diff hunks — a hunk that looks fine in isolation can break an invariant elsewhere in the file. Check, in priority order:

1. **Bugs** — logic errors, wrong conditions, unhandled edge cases, broken error handling
2. **Security** — injection, missing authorization, secrets in code, unsafe deserialization
3. **Performance** — N+1 queries, work inside loops that belongs outside, missing indexes implied by new query patterns
4. **Convention violations** — anything the skills loaded in Step 3 forbid
5. **Code quality** — dead code, misleading names, needless complexity

## Step 5 — Classify

Sort every finding into one of three buckets:

- **High** — obvious bugs, security issues, clear mistakes, or well-founded suggestions with a precise fix
- **Medium** — reasonable but context-dependent concerns, style/performance suggestions, fixes that need manual judgment
- **Low** — likely false positives, nitpicks, suggestions without clear value: **discard silently**. Never pad the report.

## Step 6 — Report

Present results with this template:

```markdown
## Code Review Results

**Files reviewed**: N
**Issues found**: X high priority / Y medium priority

### High Priority

- **`path/to/file.py:42`** — Brief description
  > Recommendation: How to fix

### Medium Priority

- **`path/to/file.ts:88`** — Brief description
  > Recommendation: How to fix (if applicable)
```

Every finding cites `path:line`. If nothing survived the Low filter: "Review complete — no issues found in N files."

## Step 7 — Fix only on consent

- If the user explicitly asked to "review and fix" (or similar), apply fixes after reporting.
- If they only asked for a review, report and stop — ask before changing anything.
- When fixing: focus on High then Medium; apply fixes only where safe and well-defined; for complex fixes, describe what needs to be done instead of forcing a change. Never commit — leave the fixes in the working tree for the user to verify.
