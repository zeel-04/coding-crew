---
name: django-models
description: Use when creating, editing, or reviewing a Django models.py file. Enforces this project's model-layer conventions — BaseModel inheritance, where validation/derived values belong (model vs. service), and DB constraints over clean().
---

Models hold the data shape. Push anything that spans relations, fetches data, or is otherwise non-trivial out to a service or selector.

## Base model

Every model inherits a shared `BaseModel` for `created_at`/`updated_at`. Don't redeclare these fields per-model.

```python
class BaseModel(models.Model):
    created_at = models.DateTimeField(db_index=True, default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
```

## Validation

| Validation needs | Where |
| --- | --- |
| Enforceable purely in the DB (uniqueness, field comparisons, one-of-N) | `Meta.constraints` (`CheckConstraint`, `UniqueConstraint`) — prefer this first |
| Simple, local, non-relational fields only | Model `clean()` |
| Complex, spans relations, or fetches other data | Service layer |

- Constraints win over `clean()` when both are possible: less code, and the DB protects the invariant even from writes that bypass `full_clean()`.
- `clean()` only runs via `full_clean()`. Call `full_clean()` in the **service**, immediately before `save()` — never override `save()` to call it.
- It's fine for the same rule to exist in both `clean()` and a constraint. It is not fine to rely on `clean()` alone for something a constraint could enforce.

```python
class Course(BaseModel):
    name = models.CharField(unique=True, max_length=255)
    start_date = models.DateField()
    end_date = models.DateField()

    class Meta:
        constraints = [
            models.CheckConstraint(
                name="start_date_before_end_date",
                check=Q(start_date__lt=F("end_date")),
            )
        ]
```

```python
class CourseCreateService:
    @transaction.atomic
    def execute(self, *, name: str, start_date: date, end_date: date) -> Course:
        obj = Course(name=name, start_date=start_date, end_date=end_date)
        obj.full_clean()
        obj.save()
        return obj
```

## Choices / enums

Group related constants under one concept (e.g. a `role` of `OWNER`/`MEMBER`) instead of scattering loose module-level constants.

| The value set is | Where |
| --- | --- |
| Stored in a model field | `models.TextChoices` in `models.py`, used as `choices=` on the field |
| Not stored in the DB (internal flags, config keys) | plain `enum.Enum` in `types.py` — see [[django-structure]] |

`TextChoices` gives you `.choices`, `.labels`, and `.values` for free, and the human label lives beside the value.

```python
class Role(models.TextChoices):
    OWNER = "OWNER", "Owner"
    MEMBER = "MEMBER", "Member"


class Membership(BaseModel):
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.MEMBER)
```

## Indexing

Add an index only when a real query needs it — every index taxes each insert and update.

| Scenario | Index |
| --- | --- |
| Column used in a frequent `WHERE` with `=` (exact match) | Single-column index (`db_index=True` or `Meta.indexes`) |
| Column used with `ILIKE 'term%'` (prefix search) | Single-column index — helps prefix patterns only |
| A frequent query filters several columns **together** | One composite index over those columns, not separate single-column ones |
| A column drives a frequent `ORDER BY`, often alongside a filter | Put the sort column last in the index covering that filter |
| Foreign-key fields | Already indexed by Django — don't re-add |

**Composite ordering:** equality-filtered columns first, then range/sort columns. A composite index follows the leftmost-prefix rule — an index on `(a, b)` serves `WHERE a=...` (and `WHERE a=... AND b=...`), but **not** `WHERE b=...` alone.

**`ILIKE '%term%'` caveat:** a leading wildcard defeats a b-tree index entirely. Keep indexed searches prefix-only; if genuine substring search is a requirement, reach for a `pg_trgm` GIN index rather than pretending a plain index helps.

Don't index rarely-queried columns, tiny tables, or write-heavy columns whose reads are incidental.

```python
class Membership(BaseModel):
    status = models.CharField(max_length=16)

    class Meta:
        indexes = [
            models.Index(fields=["status", "created_at"], name="membership_status_created_idx"),
        ]
```

## Properties and methods

| Add to the model when | Move to a service/selector when |
| --- | --- |
| Derived value uses only this instance's **non-relational** fields | Value spans relations or needs another query |
| Calculation is simple | Calculation is non-trivial |
| No arguments needed → `@property` | Needs arguments → method, not property |
| Setting one field always requires setting another derived field together (e.g. `set_new_secret`) | — |

```python
@property
def has_started(self) -> bool:
    return self.start_date <= timezone.now().date()

def is_within(self, x: date) -> bool:
    return self.start_date <= x <= self.end_date
```

If a property/method needs to join, filter, or hit the DB beyond `self`, it does not belong on the model — write a selector or service function instead.
