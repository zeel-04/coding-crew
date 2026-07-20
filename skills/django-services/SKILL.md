---
name: django-services
description: Use when creating, editing, or reviewing files in services/ or selectors.py. Enforces this project's service-layer conventions — class-based services in services/<entity>_services.py, naming, transactions, and the push (service) vs. pull (selector) split.
---

Services own business logic. Selectors own reads. Keep both decoupled from views and from each other's responsibilities.

## Services are always classes

Never write a function-based service. Use plain functions only for private helpers inside the service module — name them with a leading underscore and keep them out of the public API.

A service class:

- Lives in `services/<entity>_services.py` (e.g. `services/employee_services.py`).
- Takes shared dependencies in `__init__` when multiple methods need them.
- Uses keyword-only arguments on public methods that take more than one input.
- Wraps DB-writing methods in `@transaction.atomic` (see [Transactions](#transactions)).
- Calls `full_clean()` immediately before `save()` (see [[django-models]] for why this lives here, not in the model).

## Naming convention

| Shape | Pattern | Example |
| --- | --- | --- |
| Single operation | `<Entity><Action>Service` | `UserCreateService`, `UserDeactivateService` |
| Multi-step flow | `<Entity><Flow>Service` | `FileDirectUploadService` (with `.start()` / `.finish()`) |

Consistent naming makes services greppable by entity or by suffix.

```python
class CourseCreateService:
    @transaction.atomic
    def execute(self, *, name: str, start_date: date, end_date: date) -> Course:
        obj = Course(name=name, start_date=start_date, end_date=end_date)
        obj.full_clean()
        obj.save()
        return obj
```

A multi-step flow exposes one method per step instead of a single `execute`:

```python
class FileDirectUploadService:
    def __init__(self, user: BaseUser):
        self.user = user

    @transaction.atomic
    def start(self, *, file_name: str, file_type: str) -> dict: ...

    @transaction.atomic
    def finish(self, *, file: File) -> File: ...
```

## Transactions

`@transaction.atomic` is **mandatory** when a service method performs **two or more writes** (insert/update/delete) that must succeed or fail as a unit. A single-write method may keep the decorator (harmless), but a multi-write method without it is a review failure — a partial failure would leave the DB half-updated.

- **One boundary per user action.** The outermost `atomic` belongs on the public service method. Never open transactions in views or selectors.
- **Nesting is fine.** When a service calls another service, Django turns the inner `atomic` block into a savepoint — don't manage savepoints by hand.
- **Side effects run after commit.** Anything non-DB — sending email, dispatching a Celery task, calling an external API — must go through `transaction.on_commit(...)`. Called inline, it would fire even when the transaction later rolls back.
- **Lock rows that race.** For read-modify-write on the same row (balances, counters), use `select_for_update()` inside the atomic block so concurrent writers serialize.

## Selectors are function-based

Selectors are the read-only counterpart to services. They live in `<app>/selectors.py` (a single flat file), stay type-annotated, and have no side effects.

```python
def user_list(*, fetched_by: User) -> Iterable[User]:
    user_ids = user_get_visible_for(user=fetched_by)
    return User.objects.filter(Q(id__in=user_ids))
```

Decision rule: if the code **writes** to the DB, dispatches a task, or calls an external service → service class. If it only **reads/filters/fetches** → selector function.

## Modules

`services/` is always a folder — one file per entity or domain, named `<entity_or_domain>_services.py`:

```
services/
├── __init__.py          # empty
├── employee_services.py
└── course_services.py
```

## Naming when multiple entities are involved

Ask: **"What concept is this file responsible for?"**

**One primary entity, other entities are dependencies** — name by the primary entity. A service that enrolls an `Employee` into a `Course` acts on `Employee`; `Course` is just an input. Use `employee_services.py`.

**No single dominant entity — a domain or workflow** — name by the domain concept, not any one entity. `Payroll`, `Onboarding`, and `Reporting` span multiple entities with no clear primary; use `payroll_services.py`, `onboarding_services.py`, `reporting_services.py`.

Avoid compound entity names like `employee_course_services.py`. That name is a signal to either identify the primary entity (Case 1) or find the right domain abstraction (Case 2).
