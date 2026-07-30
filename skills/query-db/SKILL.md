---
name: query-db
description: Query the database for fetching any data you need.
---

## Preferred: postgres MCP server (when connected)

Use the `postgres` MCP tools first — they query the repo's real database directly:

- `execute_sql` — run SQL (read-only unless the repo set `POSTGRES_MCP_ACCESS=unrestricted` in `.env`)
- `list_schemas` / `list_objects` / `get_object_details` — inspect schemas, tables, columns, indexes
- `explain_query` — execution plans; `analyze_query_indexes` — index recommendations
- `analyze_db_health` — index/connection/vacuum/replication health

Example: `execute_sql` with `SELECT count(*) FROM expenses_request;`

## Fallback: Django shell

Use when the postgres server is disconnected (no `DATABASE_URI` in this repo's `.env`)
or when ORM-level behavior matters (custom managers, properties, model methods):

```bash
uv run python manage.py shell -c "from expenses.models import Request; print(Request.objects.count())"
```
