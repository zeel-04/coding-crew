---
name: frontend-api-layer
description: Use when creating, editing, or reviewing the frontend data layer — lib/api/client.ts, or any module's lib/api/<module>.ts, lib/hooks/use-<module>.ts, or lib/types/<module>.ts file. Enforces this project's frontend-owned API client conventions, fetching patterns per component type, and error handling.
---

The frontend data layer talks to the backend through a two-layer API client, with per-module types and SWR-wrapped hooks layered on top. Persistence and HTTP contract ownership live in the backend; the frontend only adapts backend endpoints for UI use. **Never call raw `fetch` from a module or component** — always go through the base client.

```
lib/
├── api/
│   ├── client.ts          # base layer — auth, base URL, error handling
│   ├── auth.ts            # auth endpoint calls
│   └── orders.ts          # order endpoint calls
├── hooks/
│   ├── use-auth.ts
│   └── use-orders.ts      # useOrder(), useOrderList() — wraps lib/api/orders.ts with SWR
└── types/
    ├── auth.ts
    └── orders.ts          # Order, OrderStatus, OrderTimeline
```

Dependency direction is one-way: `types` → `api` → `hooks` → components. A file never imports from a layer to its right in that chain from within the same module.

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

## Module types

One file per module in `lib/types/<module>.ts` — plain type/interface exports only, no runtime logic. This is the base of the dependency chain: it imports from nothing else in the module.

```ts
// lib/types/users.ts
export interface User {
  id: string
  name: string
  email: string
}
```

## Module API files

One file per module in `lib/api/<module>.ts`, colocated with `client.ts`. Export typed async functions for that module's endpoints — reads and writes alike, all through `apiFetch`, typed against `lib/types/<module>.ts`. Never reuse one module's file from another module; if logic is shared, it belongs in the base client.

```ts
// lib/api/users.ts
import { apiFetch } from '@/lib/api/client'
import type { User } from '@/lib/types/users'

export const getUser = (id: string) =>
  apiFetch<User>(`/users/${id}`)

export const updateUser = (id: string, data: Partial<User>) =>
  apiFetch<User>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
```

## Module hooks

One file per module in `lib/hooks/use-<module>.ts`, always a `'use client'` file. Export one [SWR](https://swr.vercel.app/)-wrapped hook per query shape (e.g. `useUser(id)`, `useUserList()`); each hook is a thin `useSWR` call keyed on the endpoint path, using the matching `lib/api/<module>.ts` function as the fetcher.

```ts
// lib/hooks/use-users.ts
'use client'
import useSWR from 'swr'
import { getUser } from '@/lib/api/users'
import type { User } from '@/lib/types/users'

export function useUser(id: string) {
  return useSWR<User>(`/users/${id}`, () => getUser(id))
}
```

## Fetching by component type

| Context | Pattern |
|---------|---------|
| Server Component | Call the `lib/api/<module>.ts` function directly — no hook, no `useEffect` |
| Client Component (read) | Use the module's hook from `lib/hooks/use-<module>.ts` |
| Mutation | Call the `lib/api/<module>.ts` function from an event handler, then revalidate with SWR `mutate` using the same key the hook uses |

**Server Component (reads)**

```tsx
// app/users/[id]/page.tsx
import { getUser } from '@/lib/api/users'

export default async function UserPage({ params }: { params: { id: string } }) {
  const user = await getUser(params.id)
  return <UserProfile user={user} />
}
```

**Client Component (interactive reads)**

```tsx
'use client'
import { useUser } from '@/lib/hooks/use-users'

export function UserCard({ id }: { id: string }) {
  const { data, error, isLoading } = useUser(id)
  // ...
}
```

**Mutation**

```tsx
'use client'
import { useSWRConfig } from 'swr'
import { updateUser } from '@/lib/api/users'

export function EditUser({ id }: { id: string }) {
  const { mutate } = useSWRConfig()

  async function save(data: Partial<User>) {
    await updateUser(id, data)
    mutate(`/users/${id}`) // must match the key used in useUser()
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
