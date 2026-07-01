---
name: django-settings
description: Use when setting up or modifying project configuration — the config/ folder, reading env vars, or adding a new settings module for a third-party integration.
---

Settings are split by concern, not by environment. Environment differences (DEBUG, secrets, broker URLs) are controlled through env vars — not multiple settings files.

## Folder layout

`config/` is the settings root. `DJANGO_SETTINGS_MODULE` points at `django_configs.py`; everything else is imported from it.

```
config/
├── __init__.py
├── settings/
│   ├── __init__.py
│   ├── django_configs.py     # entry point — Django core settings + wildcard imports below
│   ├── celery.py             # CELERY_BROKER_URL, result backend, task routes, beat schedule
│   ├── cors.py               # CORS_ALLOWED_ORIGINS, CORS_ALLOW_CREDENTIALS
│   ├── email_backend.py      # EMAIL_BACKEND, SMTP host/port/credentials, DEFAULT_FROM_EMAIL
│   ├── sentry.py             # sentry_sdk.init, DSN, integrations, traces sample rate
│   ├── sessions.py           # SESSION_ENGINE, cookie age, SESSION_COOKIE_SECURE
│   ├── jwt.py                # SIMPLE_JWT — token lifetimes, signing key, rotation
│   ├── database.py           # DATABASES (SQL), CACHES (Redis/locmem)
│   └── files_and_storages.py # STORAGES, S3 / R2 buckets, credentials, custom domain
├── loggers/
│   ├── __init__.py
│   ├── settings.py           # log level, format, sinks, BETTERSTACK_SOURCE_TOKEN
│   └── setup.py              # configure_logging() — remove default sink, intercept stdlib logging
├── env.py                    # single import point for reading env vars
├── urls.py
├── wsgi.py
└── asgi.py
```

## Entry point: `django_configs.py`

`django_configs.py` holds Django core settings (`INSTALLED_APPS`, `MIDDLEWARE`, `TEMPLATES`, `AUTH`, i18n, `DEBUG`, `ALLOWED_HOSTS`, static/media). At the top, it reads `.env` and derives `BASE_DIR`. At the bottom, it wildcard-imports the remaining modules:

```python
import os

from config.env import env, environ

BASE_DIR = environ.Path(__file__) - 3

env.read_env(os.path.join(BASE_DIR, ".env"))

# ... Django core settings ...

from config.settings.celery import *           # noqa
from config.settings.cors import *             # noqa
from config.settings.email_backend import *    # noqa
from config.settings.sentry import *           # noqa
from config.settings.sessions import *         # noqa
from config.settings.jwt import *              # noqa
from config.settings.database import *         # noqa
from config.settings.files_and_storages import *  # noqa
```

Each remaining module owns one concern — its own Django settings plus any related third-party setup (e.g. `sentry_sdk.init` lives in `sentry.py`, not in `django_configs.py`).

## `env.py` — single import point

`environ.Env()` is instantiated once, in `config/env.py`. Every module that needs an env var imports `env` from there — never creates its own instance.

```python
# config/env.py
import environ

env = environ.Env()
```

```python
# any settings module
from config.env import env

MY_VAR = env("MY_VAR")
```

Don't do this — it creates a second, isolated instance with no shared type coercions or defaults:

```python
# wrong — in a settings module
import environ
env = environ.Env()
```

## Adding a new settings module

When adding a new integration, follow these three steps:

1. Create `config/settings/<concern>.py` and read whatever env vars it needs via `from config.env import env`.
2. Define the Django settings (and any third-party `init` call) inside that file.
3. Add a wildcard import at the bottom of `django_configs.py`:

```python
from config.settings.<concern> import *  # noqa
```

## Environment variable naming

Prefix Django-specific variables with `DJANGO_`. Do not prefix variables that belong to the external service itself.

| Variable | Prefix |
|---|---|
| `DEBUG`, `ALLOWED_HOSTS`, `SECRET_KEY`, `CORS_ORIGIN_WHITELIST` | `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, etc. |
| `AWS_SECRET_KEY`, `CELERY_BROKER_URL`, `SENTRY_DSN`, `EMAILS_ENABLED` | No prefix |

The rule of thumb: if the variable would only ever exist because Django is running, prefix it. If the variable belongs to the service (AWS, Celery, Sentry), leave it unprefixed — those services may exist outside Django too.

## What not to do

- **Don't create per-environment files** (`dev.py`, `prod.py`, `local.py`). That splits config across two axes — concern and environment — which compounds quickly. Use env vars for environment differences instead.
- **Don't instantiate `environ.Env()` outside `config/env.py`**. Multiple instances won't share type coercions or defaults.
- **Don't commit `.env`**. Commit `.env.example` with empty values so new developers can see which variables are required.
