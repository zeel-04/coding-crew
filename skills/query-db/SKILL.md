---
name: query-db
description: Query the database for fetching any data you need.
---

Execute One-off query like below mentioned example:

```bash
python manage.py shell -c "from expenses.models import Request; print(Request.objects.count())"
```