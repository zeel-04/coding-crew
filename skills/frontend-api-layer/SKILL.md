---
name: frontend-api-layer
description: Use when creating, editing, or reviewing the frontend API layer — lib/api/client.ts or any features/<module>/api.ts file. Enforces this project's frontend-owned API client conventions, fetching patterns per component type, and error handling.
---

The frontend API layer talks to the backend through a two-layer API client. Persistence and HTTP contract ownership live in the backend; the frontend only adapts backend endpoints for UI use. **Never call raw `fetch` from a module or component** — always go through the base client.

```
lib/
└── api/
    └── client.ts          # base layer — auth, base URL, error handling

features/
├── auth/
│   └── api.ts             # auth endpoint calls
└── orders/
    └── api.ts             # order endpoint calls
```

## Base client

`lib/api/client.ts` is the only file that owns auth headers, the base URL, and error normalization. Anything used by two or more modules graduates into this file — never duplicate it into a module.

```ts
class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...options?.headers,
    },
  })

  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json() as Promise<T>
}
```

## Module API files

One `api.ts` per feature, colocated in `features/<module>/`. Export typed async functions for that module's endpoints — reads and writes alike, all through `apiFetch`. Never reuse one module's `api.ts` from another module; if logic is shared, it belongs in the base client.

```ts
// features/users/api.ts
import { apiFetch } from '@/lib/api/client'

export const getUser = (id: string) =>
  apiFetch<User>(`/users/${id}`)

export const updateUser = (id: string, data: Partial<User>) =>
  apiFetch<User>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
```

## Fetching by component type

| Context | Pattern |
|---------|---------|
| Server Component | Call module functions directly — no hook, no `useEffect` |
| Client Component (read) | Wrap with [SWR](https://swr.vercel.app/) |
| Mutation | Call the module function from an event handler, then revalidate with SWR `mutate` |

**Server Component (reads)**

```tsx
// app/users/[id]/page.tsx
import { getUser } from '@/features/users/api'

export default async function UserPage({ params }: { params: { id: string } }) {
  const user = await getUser(params.id)
  return <UserProfile user={user} />
}
```

**Client Component (interactive reads)**

```tsx
'use client'
import useSWR from 'swr'
import { getUser } from '@/features/users/api'

export function UserCard({ id }: { id: string }) {
  const { data, error, isLoading } = useSWR(`/users/${id}`, () => getUser(id))
  // ...
}
```

**Mutation**

```tsx
'use client'
import { useSWRConfig } from 'swr'
import { updateUser } from '@/features/users/api'

export function EditUser({ id }: { id: string }) {
  const { mutate } = useSWRConfig()

  async function save(data: Partial<User>) {
    await updateUser(id, data)
    mutate(`/users/${id}`)
  }
  // ...
}
```

## Error handling

Catch `ApiError` only at the call site that can meaningfully respond to a specific status.

```ts
try {
  await updateUser(id, data)
} catch (err) {
  if (err instanceof ApiError && err.status === 404) {
    notFound()
  }
  throw err
}
```

Never swallow an error silently. If there is no recoverable path at the call site, let it propagate to the nearest `error.tsx` boundary.
