---
name: django-errors
description: Use when creating, editing, or reviewing Django exceptions.py or a custom DRF exception handler. Enforces this project's error contract — ApplicationError hierarchy and the normalized {message, extra} response shape.
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

Status codes: `400` validation, `401` auth, `403` permission, `404` not found, `429` throttled, `500` server (never silenced — report to Sentry/equivalent).

## Exception hierarchy

Define one base error for business-logic exceptions, in a shared `core` app:

```python
class ApplicationError(Exception):
    def __init__(self, message, extra=None):
        super().__init__(message)
        self.message = message
        self.extra = extra or {}
```

Raise `ApplicationError` (or a subclass) from services/selectors for business-rule violations. Let DRF handle everything else by default — don't catch and re-raise exceptions you don't need to transform.

## Custom exception handler

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
- Don't let a service catch `ApplicationError` and swallow it; let it propagate to the handler.
- Don't silently catch unexpected (non-`ApplicationError`) exceptions in a view or service — unhandled exceptions should surface as `500`s that get reported, not disappear.
