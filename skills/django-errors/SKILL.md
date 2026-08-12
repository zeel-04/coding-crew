---
name: django-errors
description: Use when creating, editing, or reviewing error handling in views, exceptions.py, or a custom DRF exception handler. Enforces this project's error contract — the normalized {message, extra} response shape, the ApplicationError hierarchy, and the per-action try/except ladder in ViewSets.
---

The API must return one consistent error shape regardless of what raised it. Don't let DRF's default inconsistencies (arrays, dicts, `{"detail": ...}`) leak to clients.

## Error contract

Every error response is:

```json
{
  "message": "The error message here",
  "extra": {}
}
```

`extra` carries structured data for the frontend — e.g. field errors:

```json
{
  "message": "Validation error.",
  "extra": {
    "fields": {
      "password": ["This field cannot be blank."]
    }
  }
}
```

Status codes: `400` validation, `401` auth, `403` permission, `404` not found, `429` throttled, `500` server (never silenced — log with a traceback).

## Exception hierarchy

Define one base error for business-logic exceptions, in a shared `core` app:

```python
class ApplicationError(Exception):
    def __init__(self, message, extra=None):
        super().__init__(message)
        self.message = message
        self.extra = extra or {}
```

Raise `ApplicationError` (or an app-specific subclass from `exceptions.py`) from services/selectors for business-rule violations — services never build `Response`s and never know about HTTP.

## The try/except ladder

Every ViewSet action wraps its whole body in try/except and maps each failure to the contract above:

```python
import traceback

from loguru import logger
from rest_framework import serializers, status
from rest_framework.response import Response

    def create(self, request):
        try:
            serializer = CourseCreateInputSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            course = CourseCreateService().execute(**serializer.validated_data)
            return Response(
                {
                    "message": "Course created successfully.",
                    "data": CourseCreateOutputSerializer(course).data,
                },
                status=status.HTTP_201_CREATED,
            )
        except serializers.ValidationError:
            return Response(
                {"message": "Validation error.", "extra": {"fields": serializer.errors}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except ApplicationError as e:
            return Response(
                {"message": e.message, "extra": e.extra},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            logger.error(f"Error creating course: {e}\n{traceback.format_exc()}")
            return Response(
                {"message": "An unexpected error occurred.", "extra": {}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
```

- The `try` wraps the whole action body. The ladder is response plumbing, not business logic — decisions still live in services/selectors.
- Arm order is part of the contract: `serializers.ValidationError` → `ApplicationError` → `Exception`. A reordered ladder silently converts `400`s into `500`s.
- Drop arms the action can't hit — no input serializer, no `ValidationError` arm. The `except Exception` arm is never optional.
- Every arm returns the `{message, extra}` shape, so a caught error is indistinguishable from one the exception handler normalized.
- Django's model `ValidationError` (from `full_clean()`) lands in the `500` arm unless the handler catches it first. Anything a client can get wrong must be caught by the InputSerializer.

## Logging

Log the exception and the full traceback before returning any `500`, naming the action that failed:

```python
logger.error(f"Error uploading global file: {e}\n{traceback.format_exc()}")
```

- Never return a `500` without this line — the generic client message is the only thing the caller gets, so the traceback is the only record.
- `400`s and `404`s are expected outcomes, not failures. Don't error-log them.

## Custom exception handler

The ladder covers what an action raises; the handler covers everything raised around it — auth (`401`), permission (`403`), throttling (`429`), and routing `404`s all fire before the action body runs. Both produce the same shape.

Two gaps the default DRF handler leaves open, both must be normalized:

1. **Django's `ValidationError`** (from `model.full_clean()`) isn't recognized by DRF and becomes an unhandled `500`. Map it to `rest_framework.exceptions.ValidationError` via `as_serializer_error`.
2. **`ApplicationError`** has no DRF handler by default — when `exception_handler` returns `None` and the exception is an `ApplicationError`, build the response manually.

```python
def custom_exception_handler(exc, ctx):
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(as_serializer_error(exc))
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()
    if isinstance(exc, PermissionDenied):
        exc = exceptions.PermissionDenied()

    response = exception_handler(exc, ctx)

    if response is None:
        if isinstance(exc, ApplicationError):
            return Response({"message": exc.message, "extra": exc.extra}, status=400)
        return response

    if isinstance(exc.detail, (list, dict)):
        response.data = {"detail": response.data}

    if isinstance(exc, exceptions.ValidationError):
        response.data["message"] = "Validation error"
        response.data["extra"] = {"fields": response.data["detail"]}
    else:
        response.data["message"] = response.data["detail"]
        response.data["extra"] = {}

    del response.data["detail"]
    return response
```

Strategy: reuse as much of DRF's default handling as possible, then reshape the response — don't reimplement exception routing from scratch unless the project has outgrown this.

## What not to do

- Don't raise raw DRF exceptions with a dict `detail` and call it done — it bypasses the `{message, extra}` contract.
- Don't return a `500` from the catch-all arm without logging the traceback first — that's how an exception disappears.
- Don't put `except Exception` above the specific arms — it swallows them.
- Don't let a service catch `ApplicationError` and swallow it, or catch exceptions to return `None`/a sentinel — raise, and let the view's ladder translate it.
- Don't raise `Http404` or use `get_object_or_404` inside an action — the catch-all arm turns it into a `500` before the handler ever sees it. Use `filter().first()` plus an explicit `404`, see [[django-apis]].
