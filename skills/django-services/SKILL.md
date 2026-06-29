---
name: django-services
description: Use when creating, editing, or reviewing a Django services.py or selectors.py file. Enforces this project's service-layer conventions — class-based services, naming, transactions, and the push (service) vs. pull (selector) split.
---

Services own business logic. Selectors own reads. Keep both decoupled from views and from each other's responsibilities.

## Services are always classes

Never write a function-based service. Use plain functions only for private helpers inside the service module — name them with a leading underscore and keep them out of the public API.

A service class:

- Lives in `<app>/services.py` (or a `services/` package once it grows — see Modules below).
- Takes shared dependencies in `__init__` when multiple methods need them.
- Uses keyword-only arguments on public methods that take more than one input.
- Wraps DB-writing methods in `@transaction.atomic`.
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

## Selectors are function-based

Selectors are the read-only counterpart to services. They live in `<app>/selectors.py`, stay type-annotated, and have no side effects.

```python
def user_list(*, fetched_by: User) -> Iterable[User]:
    user_ids = user_get_visible_for(user=fetched_by)
    return User.objects.filter(Q(id__in=user_ids))
```

Decision rule: if the code **writes** to the DB, dispatches a task, or calls an external service → service class. If it only **reads/filters/fetches** → selector function.

## Modules

Keep `services.py` / `selectors.py` as single files while the app is small. Split into a package once it covers multiple sub-domains:

```
services/
├── __init__.py   # re-export classes so callers import from `app.services`
├── jwt.py
└── oauth.py
```

Whichever shape you pick, keep it consistent across the project — don't mix flat files and packages between apps without a reason.
