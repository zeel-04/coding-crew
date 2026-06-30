---
name: django-apis
description: Use when creating, editing, or reviewing files in views/, serializers/, or urls.py. Enforces this project's API-layer conventions — thin ViewSets with no business logic, per-action serializers in serializers/<entity>_serializers.py, naming, and Router-based URL registration.
---

APIs are a thin interface onto services and selectors. They parse input, fetch objects, call a service/selector, and serialize output — nothing else.

## Views

- One `ViewSet` per resource. Actions (`list`, `create`, `retrieve`, `update`, `destroy`) are explicit methods on the class.
- Inherit from plain `ViewSet`, not `ModelViewSet` or `GenericViewSet` — those pull behavior into `serializer_class`, and business behavior belongs in services/selectors.
- **No business logic in the view.** If parsing gets non-trivial, extract a small helper near the ViewSet — don't let it grow into logic.

Naming: `<Entity>ViewSet` — e.g. `CourseViewSet`.

```python
from rest_framework import status
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet

from .selectors import course_list
from .serializers.course_serializers import (
    CourseCreateInputSerializer,
    CourseListFilterSerializer,
    CourseListOutputSerializer,
)
from .services.course_services import CourseCreateService

class CourseViewSet(SomeAuthenticationMixin, ViewSet):
    def list(self, request):
        filter_serializer = CourseListFilterSerializer(data=request.query_params)
        filter_serializer.is_valid(raise_exception=True)

        courses = course_list(filters=filter_serializer.validated_data)
        return Response(CourseListOutputSerializer(courses, many=True).data)

    def create(self, request):
        serializer = CourseCreateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        CourseCreateService().execute(**serializer.validated_data)
        return Response(status=status.HTTP_201_CREATED)
```

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

Default: fetch the object at the ViewSet level (not inside the service/selector) using a small `get_object` helper that turns `Http404` into `None`:

```python
def get_object(model_or_queryset, **kwargs):
    try:
        return get_object_or_404(model_or_queryset, **kwargs)
    except Http404:
        return None
```

Pick one approach per project (ViewSet fetches and passes the object, vs. service/selector fetches by id) and stay consistent — don't mix both within the same app.

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
