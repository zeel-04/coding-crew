---
name: data-driven-testing
description: Use when writing or reviewing tests in any stack — unit tables, API cases, or browser end-to-end flows. Cases live in data (JSON fixtures or plain-English steps), driven by one runner or one script per flow. Add a case, not a new test function.
---

Test observable behavior — return values, thrown errors, HTTP responses, what the user sees. Never assert on private helpers or internal call order.

## Layout

```
<test tree>/                 # the stack's usual place: tests/ in a Django app, __tests__/ in a Next.js app
└── <domain>/
    ├── test_data/
    │   └── <cases>.json     # fixtures beside the runner that reads them
    └── <runner>             # one parametrized runner per fixture shape

e2e/                         # top level, never inside the unit test tree
├── support.<ext>            # shared helpers: sign-in, browser setup, seed steps
└── flows/
    └── <flow_name>/
        ├── steps.md         # the flow in plain English, numbered
        └── <flow script>    # Playwright script mirroring the steps
```

The unit runner must never pick up `e2e/` — different runner, slower lifecycle.

## Data-driven tables

Once **3+ tests share a shape**, move the cases into a JSON array and drive them with one parametrized runner (`pytest.mark.parametrize`, `test.each`, `subTest`). A one-off test stays inline.

Every case has a stable `id` (`RESOURCE-ACTION-NNN`, e.g. `TASK-CREATE-002`) and a `description`, so failures name themselves. Number by what the case tests (`001` happy path, `002` missing field), not insertion order.

| Shape | Case holds |
|---|---|
| Pure function | inputs → `expected` |
| Unit with collaborators | per-dependency `{ "resolve": … }` or `{ "error": { "type", "message" } }` → `expected` |
| API endpoint | `method`, `endpoint`, `headers`, `payload`, `expected_status`, `expected_body` |

- **Mock only at module boundaries** (data access, auth, external clients). Keep pure collaborators real — e.g. the real validation schema.
- **Rebuild real errors** from the fixture's `{ type, message }` so assertions run against actual error classes.
- **API bodies are subset matches** — list only the keys the case tests; `null` skips the body check.
- **Every endpoint covers:** happy path, auth failure (`401`), not found (`404`, single-object routes), validation failure (`400`, writes). Add `403` only where roles are enforced.
- **Reset mocks and state between cases.**

## End-to-end flows

E2E drives the real app in a browser against a real or seeded backend — no mocks. It's slow, so keep flows **few and critical**; push edge cases into the tables above.

Each flow is a pair:

`steps.md` — intent, readable by anyone:

```markdown
# Flow: Create and edit a broker

- id: E2E-BROKER-001
- preconditions: signed-in staff user

1. Open Brokers and click "New broker".
2. Fill name and email; submit.
3. Expect the broker in the list.
4. Open it, change the name, and save.
5. Expect the new name in the list.
```

The script — executable truth, one `Step N` comment per step:

```python
def test_create_and_edit_broker(self):
    # Step 1: Open Brokers and click "New broker".
    page.goto("/brokers/")
    page.get_by_role("link", name="New broker").click()
    # Step 2: ...
```

- **Steps and `Step N` comments stay 1:1.** Change `steps.md` first, then the script.
- **Seed, don't mock.** State comes from the preconditions or earlier steps in the same flow.
- **Each flow stands alone.** No flow depends on another having run.
- **Unique data per run** (a run id in names) so reruns never collide.
- **Assert what the user sees** — text, URLs, roles. Fail the flow on any console error or 5xx.
- **Headless by default.** Base URL and credentials come from env vars with local defaults.

## Don't

- Hand-write near-identical test functions — add a case.
- Write fixtures that encode the implementation instead of inputs and outputs.
- Test framework or library behavior (ORM, router internals) or plain markup.
- Hit a real database or network from unit tests.
- Let `steps.md` drift from its script.
