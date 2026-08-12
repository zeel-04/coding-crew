---
name: django-apis
description: Use when creating, editing, or reviewing files in views/, serializers/, or urls.py. Enforces this project's API-layer conventions — thin ViewSets with per-action try/except error handling and no business logic, per-action serializers in serializers/<entity>_serializers.py, the {message, data} response envelope, naming, and Router-based URL registration.
---

APIs are a thin interface onto services and selectors. They parse input, fetch objects, call a service/selector, serialize output, and map errors to responses via the standard try/except ladder — nothing else.

## Views

- One `ViewSet` per resource. Actions (`list`, `create`, `retrieve`, `update`, `destroy`) are explicit methods on the class.
- Inherit from plain `ViewSet`, not `ModelViewSet` or `GenericViewSet` — those pull behavior into `serializer_class`, and business behavior belongs in services/selectors.
- **No business logic in the view.** If parsing gets non-trivial, extract a small helper near the ViewSet — don't let it grow into logic.
- **Every action wraps its whole body in try/except.** The ladder is response plumbing, not business logic. Arm order, error shapes, and logging rules: [[django-errors]].

Naming: `<Entity>ViewSet` — e.g. `CourseViewSet`.

```python
import traceback

from loguru import logger
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from core.exceptions import ApplicationError

from ..models import Course
from ..serializers.course_serializers import (
    CourseCreateInputSerializer,
    CourseCreateOutputSerializer,
    CourseDetailOutputSerializer,
)
from ..services.course_services import CourseCreateService

class CourseViewSet(SomeAuthenticationMixin, ViewSet):
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

    def retrieve(self, request, pk):
        try:
            course = Course.objects.filter(
                id=pk, organization=request.organization
            ).first()
            if not course:
                return Response(
                    {"message": "Course not found.", "extra": {}},
                    status=status.HTTP_404_NOT_FOUND,
                )

            return Response(
                {
                    "message": "Course retrieved successfully.",
                    "data": CourseDetailOutputSerializer(course).data,
                },
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            logger.error(f"Error retrieving course: {e}\n{traceback.format_exc()}")
            return Response(
                {"message": "An unexpected error occurred.", "extra": {}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
```

`list` follows the same shape — a `FilterSerializer` over `request.query_params` inside the `try`, a selector call, and `data` as a `many=True` OutputSerializer payload.

## Responses

- Every success response uses the envelope `{"message": ..., "data": ...}`.
- `message` is a short past-tense confirmation — "Course created successfully.", "File uploaded successfully."
- `data` is the OutputSerializer payload — an object, or a list for `list` actions. Omit it when there is nothing to return.
- `200` for reads and updates, `201` for creates.

Errors use the separate `{message, extra}` contract — shapes and status codes: [[django-errors]].

## Serializers

- Define serializers in `serializers/<entity>_serializers.py` — never nest them inside the ViewSet class.
- Always a dedicated `InputSerializer` for incoming data and `OutputSerializer` for outgoing data — never reuse one serializer for both directions.
- Add a `FilterSerializer` for list-endpoint query params.
- Each action gets its own serializer class — never reuse serializers across actions. A shared serializer changing under you is a silent breaking change.
- Prefer plain `Serializer` over `ModelSerializer` — API contracts shouldn't drift silently when the model changes.

Naming: `<Entity><Action>InputSerializer`, `<Entity><Action>OutputSerializer`, `<Entity><Action>FilterSerializer` — e.g. `CourseCreateInputSerializer`, `CourseListOutputSerializer`, `CourseListFilterSerializer`.

```python
# serializers/course_serializers.py
from rest_framework import serializers

class CourseListFilterSerializer(serializers.Serializer):
    is_admin = serializers.NullBooleanField(required=False)

class CourseListOutputSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()

class CourseCreateInputSerializer(serializers.Serializer):
    name = serializers.CharField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
```

## Fetching objects

Fetch the object at the ViewSet level (not inside the service/selector), inside the `try` block, and return an explicit `404` on a miss:

```python
course = Course.objects.filter(id=pk, organization=request.organization).first()
if not course:
    return Response(
        {"message": "Course not found.", "extra": {}},
        status=status.HTTP_404_NOT_FOUND,
    )
```

- Never use `get_object_or_404` or raise `Http404` in an action — the catch-all arm would turn a missing object into a `500`.
- Scope the filter to the caller's tenancy, so a foreign id is indistinguishable from a missing one and can't be probed.
- Pass the fetched object into the service/selector; don't have it re-fetch by id.

## URLs

Register ViewSets with `SimpleRouter` — one router registration per resource. Prefer `SimpleRouter` over `DefaultRouter` (no extra API root endpoint).

```python
# urls.py
from rest_framework.routers import SimpleRouter
from .views.course_view import CourseViewSet

router = SimpleRouter()
router.register('courses', CourseViewSet, basename='courses')
urlpatterns = router.urls
```

Group a domain's router into its own `urls.py`, then `include()` it from the project `urlpatterns` as before.
