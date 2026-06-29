---
name: django-structure
description: Use when scaffolding a new Django app, deciding where a piece of code belongs, or reviewing an app's file layout. Defines this project's app structure — what each file owns, when a file becomes a folder, and the conventions for schema.py, types.py, and permissions.py.
---

Every Django app follows the same layout. This skill is the map; the per-layer rules live in [[django-models]], [[django-services]], [[django-apis]], [[django-errors]], and [[django-testing]].

## App layout

`api/` holds both the apps and the shared, cross-cutting modules that sit alongside them.

```
api/
├── permissions.py         # shared, project-wide DRF permission classes (see below)
└── <app>/
    ├── migrations/
    ├── tests/              # see [[django-testing]] for the data-driven API testing standard
    ├── __init__.py
    ├── admin.py
    ├── apps.py
    ├── models.py           # data model only — [[django-models]]
    ├── selectors.py        # read-only fetch/filter functions — [[django-services]]
    ├── services.py         # business logic — [[django-services]]
    ├── views.py            # request/response only, no business logic — [[django-apis]]
    ├── serializers.py      # DRF Input/Output serializers — [[django-apis]]
    ├── urls.py             # one URL per API — [[django-apis]]
    ├── schema.py           # internal DTOs (see below)
    ├── types.py            # type aliases, Literal, TypedDict, Enum (see below)
    ├── exceptions.py       # app-specific ApplicationError subclasses — [[django-errors]]
    └── utils.py            # app-scoped helper functions
```

Authorization is project-wide, so `permissions.py` lives once at the `api/` level — not inside each app.

## File becomes a folder when it grows

`views.py`, `serializers.py`, `services.py`, and `selectors.py` can each split into a package once the app outgrows a single file:

```
services/
├── __init__.py    # re-export so callers still import from `<app>.services`
├── jwt.py
└── oauth.py
```

Split by sub-domain, keep imports stable via `__init__.py`, and stay consistent across apps. See [[django-services]] for the service-module split in detail.

## schema.py — internal DTOs

Data structures passed *between* layers (e.g. a service's structured return, a value object shared across services).

- Use `@dataclass(slots=True)` for internal DTOs — the default.
- Use Pydantic **only** for validating untrusted external data (third-party webhooks, external API responses). Don't reach for Pydantic on internal, already-trusted data.

```python
from dataclasses import dataclass

@dataclass(slots=True)
class EnrollmentResult:
    course_id: int
    enrolled_at: datetime
    seats_remaining: int
```

This is distinct from DRF serializers, which live in the API layer and own the HTTP request/response contract — see [[django-apis]]. Serializers face the wire; schema DTOs face the rest of the app.

## types.py — app-scoped type vocabulary

Type aliases, `Literal`, `TypedDict`, and `Enum` definitions used across the app. Keeps annotations readable and gives shared shapes one home.

```python
from enum import Enum
from typing import Literal, TypedDict

Status = Literal["pending", "active", "closed"]

class Role(Enum):
    ADMIN = "admin"
    MEMBER = "member"

class Money(TypedDict):
    amount: int
    currency: str
```

## permissions.py — authorization

DRF custom permission classes live in one shared, project-wide module at the `api/` level — `api/permissions.py`, not a per-app file. Permission classes are reusable across apps, so they have a single home; each API wires the ones it needs into its `permission_classes`.

```python
# api/permissions.py
from rest_framework.permissions import BasePermission

class IsCourseOwner(BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.owner_id == request.user.id
```

```python
# in an app's view
from api.permissions import IsCourseOwner

class CourseUpdateApi(APIView):
    permission_classes = [IsCourseOwner]
```

Keep authorization in the permission class. Business rules that happen to involve the user (not "may this user act" but "what the action does") still belong in the service — see [[django-services]].
