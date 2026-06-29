---
name: django-apis
description: Use when creating, editing, or reviewing Django views.py, serializers.py, or urls.py. Enforces this project's API-layer conventions — thin views with no business logic, nested Input/Output serializers, naming, and URL structure.
---

APIs are a thin interface onto services and selectors. They parse input, fetch objects, call a service/selector, and serialize output — nothing else.

## Views

- One API per operation. CRUD on a model is 4 APIs, not one viewset.
- Inherit from plain `APIView`, not the more abstract generic views — those pull behavior into serializers, and business behavior belongs in services/selectors.
- **No business logic in the view.** If parsing gets non-trivial, extract a small helper near the API — don't let it grow into logic.

Naming: `<Entity><Action>Api` — e.g. `UserCreateApi`, `UserDeactivateApi`, `CourseListApi`.

```python
class CourseCreateApi(SomeAuthenticationMixin, APIView):
    class InputSerializer(serializers.Serializer):
        name = serializers.CharField()
        start_date = serializers.DateField()
        end_date = serializers.DateField()

    def post(self, request):
        serializer = self.InputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        CourseCreateService().execute(**serializer.validated_data)

        return Response(status=status.HTTP_201_CREATED)
```

## Serializers

- Always a dedicated `InputSerializer` for incoming data and `OutputSerializer` for outgoing data — never reuse one serializer for both directions.
- Nest them inside the API class. Add `FilterSerializer` for list-endpoint query params.
- Prefer plain `Serializer` over `ModelSerializer` — API contracts shouldn't drift silently when the model changes.
- Reuse serializers across APIs as little as possible; a shared serializer changing under you is a silent breaking change.

```python
class CourseListApi(APIView):
    class FilterSerializer(serializers.Serializer):
        is_admin = serializers.NullBooleanField(required=False)

    class OutputSerializer(serializers.Serializer):
        id = serializers.CharField()
        name = serializers.CharField()

    def get(self, request):
        filters_serializer = self.FilterSerializer(data=request.query_params)
        filters_serializer.is_valid(raise_exception=True)

        courses = course_list(filters=filters_serializer.validated_data)

        return Response(self.OutputSerializer(courses, many=True).data)
```

## Fetching objects

Default: fetch the object at the API level (not inside the service/selector) using a small `get_object` helper that turns `Http404` into `None`:

```python
def get_object(model_or_queryset, **kwargs):
    try:
        return get_object_or_404(model_or_queryset, **kwargs)
    except Http404:
        return None
```

Pick one approach per project (API fetches and passes the object, vs. service/selector fetches by id) and stay consistent — don't mix both within the same app.

## URLs

- One URL per API — same 1:1 mapping as APIs to operations.
- Group a domain's URLs into its own `<domain>_patterns` list, then `include()` it from `urlpatterns`.

```python
course_patterns = [
    path('', CourseListApi.as_view(), name='list'),
    path('<int:course_id>/', CourseDetailApi.as_view(), name='detail'),
    path('create/', CourseCreateApi.as_view(), name='create'),
    path('<int:course_id>/update/', CourseUpdateApi.as_view(), name='update'),
]

urlpatterns = [
    path('courses/', include((course_patterns, 'courses'))),
]
```
