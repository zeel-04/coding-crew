---
name: django-testing
description: Use when writing or reviewing API tests for a Django app. Enforces this project's data-driven testing standard — test cases live in JSON fixtures, not Python, and one parametrized test function drives all of them.
---

API tests are data-driven: write the test logic once, add new cases as JSON. Never hand-write a new Python test function for a new case — add a JSON object instead.

## Folder structure

One `.json` file per resource, grouped by Django app, named after the URL resource segment. The layout mirrors the URL structure: `/api/<django_app>/<segment>/` → `test_data/<django_app>/<segment>.json`.

```
tests/
├── test_data/
│   ├── auth/
│   │   └── tokens.json
│   └── hr/
│       ├── employees.json
│       └── tasks.json
├── conftest.py     # loads all test_data/**/*.json, parametrizes on `case`
└── test_api.py     # single test function — `test_api_case(api, case)`
```

## Test case schema

Each `.json` file is an array of case objects:

```json
{
  "id":              "TASK-CREATE-001",
  "description":     "Create task with valid payload",
  "method":          "POST",
  "endpoint":        "/api/hr/tasks/",
  "headers":         { "Authorization": "Bearer {auth_token}" },
  "payload":         { "title": "Review documents", "process_id": 1 },
  "query_params":    {},
  "expected_status": 201,
  "expected_body":   { "title": "Review documents", "status": "pending" }
}
```

All 8 fields are required on every case. Use `{}` for no headers/query params, `null` for `payload`/`expected_body` when not applicable (GET/DELETE payload, or a `204` response with nothing to check).

## Naming convention

ID format: `RESOURCE-ACTION-NNN`, sequential per action group starting at `001`.

| Action | HTTP method | Example |
| --- | --- | --- |
| `LIST` | GET (collection) | `EMP-LIST-001` |
| `DETAIL` | GET (single) | `EMP-DETAIL-001` |
| `CREATE` | POST | `EMP-CREATE-001` |
| `UPDATE` | PATCH / PUT | `EMP-UPDATE-001` |
| `DELETE` | DELETE | `EMP-DELETE-001` |
| `ACTION` | POST (custom action) | `TASK-COMPLETE-001` |

Number within an action group by what the case tests: `001` happy path, `002` missing required field, `003` duplicate value, etc. — not by insertion order.

## Required coverage per endpoint

At minimum, every endpoint needs:

- **Happy path** — valid input, expected success response.
- **Auth failure** — missing/invalid token → `401`.
- **Not found** — non-existent ID → `404` (GET/PATCH/DELETE only).
- **Validation failure** — missing/invalid field → `400` (POST/PATCH only).

Add a `403` RBAC case only if the endpoint actually enforces role-based access — don't add it speculatively.

## Assertion rules

- **Status code**: always asserted, never optional.
- **Body**: `expected_body` is a **subset match** — only the declared keys are checked. Don't list every response field; list only what the case is testing. This keeps tests stable when the API adds new response fields.
- Set `expected_body: null` to skip the body check entirely (e.g. `204 No Content`).

```json
// Only "status" is asserted — created_at, updated_at, etc. are ignored.
"expected_body": { "status": "completed" }
```

## Runner (already implemented once per project)

```python
# conftest.py
def pytest_generate_tests(metafunc):
    if "case" in metafunc.fixturenames:
        cases = load_all_cases()  # glob tests/test_data/**/*.json
        metafunc.parametrize("case", cases, ids=[c["id"] for c in cases])
```

```python
# test_api.py
def test_api_case(api, case):
    response = api.request(
        case["method"], api.base_url + case["endpoint"],
        json=case["payload"], headers=case["headers"],
        params=case.get("query_params", {}),
    )
    assert response.status_code == case["expected_status"]
    if case["expected_body"] is not None:
        actual = response.json()
        for key, value in case["expected_body"].items():
            if value is not None:
                assert actual[key] == value
```

Adding a new test case means editing a JSON file under `test_data/`. If you find yourself writing a new Python test function for a case, stop — it belongs in JSON instead.

Run a single case while iterating: `pytest tests/test_api.py -v -k "TASK-CREATE-001"`.
