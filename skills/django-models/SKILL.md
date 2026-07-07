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
