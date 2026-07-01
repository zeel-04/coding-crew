---
name: frontend-mock-data
description: Use when building or reviewing a UI/UX prototype's data layer — lib/api/client.ts, lib/api/<module>.ts, lib/hooks/use-<module>.ts, or lib/mocks/<module>.json — where there is no real backend and all data comes from local JSON fixtures.
---

The prototype data layer has the same shape as a real backend integration — `types → api → hooks → components` — except `lib/api/<module>.ts` resolves from a local JSON fixture instead of calling a network endpoint. **Never call `fetch`, hit `NEXT_PUBLIC_API_URL`, or add auth headers** — there is no backend to reach.

```
lib/
├── mocks/
│   ├── users.json         # fixture data, shaped like lib/types/users.ts
│   └── orders.json
├── api/
│   ├── client.ts          # mockDelay() helper — simulated latency only
│   ├── users.ts           # reads lib/mocks/users.json through mockDelay
│   └── orders.ts
├── hooks/
│   ├── use-users.ts
│   └── use-orders.ts      # same SWR pattern as a real integration
└── types/
    ├── users.ts
    └── orders.ts
```

Dependency direction is one-way: `types` → `mocks` → `api` → `hooks` → components.

## Mock client helper

`lib/api/client.ts` owns one thing: simulated latency. No base URL, no auth, no error normalization for a network that doesn't exist.

```ts
export function mockDelay<T>(data: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms))
}
```

## Module types

Same as a real integration — one file per module in `lib/types/<module>.ts`, plain type/interface exports.

```ts
// lib/types/users.ts
export interface User {
  id: string
  name: string
  email: string
}
```

## Fixtures

One JSON file per module in `lib/mocks/<module>.json`, matching the module's type shape exactly. Include an empty-list variant and an error-shaped record where the UI needs to demonstrate those states — a prototype exists partly to prove out loading, empty, and error UI, not just the happy path.

```json
[
  { "id": "1", "name": "Ada Lovelace", "email": "ada@example.com" },
  { "id": "2", "name": "Grace Hopper", "email": "grace@example.com" }
]
```

## Module API files

One file per module in `lib/api/<module>.ts`, colocated with `client.ts`. Export the same function names and signatures a real integration would use (`getUser`, `getUserList`, `updateUser`) so a later swap to a real backend only changes this file's body, never its callers.

```ts
// lib/api/users.ts
import { mockDelay } from '@/lib/api/client'
import type { User } from '@/lib/types/users'
import users from '@/lib/mocks/users.json'

export const getUser = (id: string) =>
  mockDelay(users.find((u) => u.id === id) as User)

export const getUserList = () => mockDelay(users as User[])
```

## Mutations

There is no persistence layer to write to. A mutation function updates the in-memory fixture array for the lifetime of the session (resets on reload) or simply resolves without side effects — either way, revalidate with SWR `mutate` exactly as a real integration would, so the UI's optimistic-update and refetch behavior is exercised.

```ts
export const updateUser = (id: string, data: Partial<User>) => {
  const updated = { ...users.find((u) => u.id === id), ...data } as User
  return mockDelay(updated)
}
```

Don't invent a fake backend (a local JSON-file-writing route handler, a fake auth token, a mock error-rate simulator beyond what a specific screen needs) — the fixture and `mockDelay` are the entire surface area.

## Module hooks

Identical to a real integration — one file per module in `lib/hooks/use-<module>.ts`, a thin SWR wrapper over the matching `lib/api/<module>.ts` function.

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
| Server Component | Call the `lib/api/<module>.ts` function directly |
| Client Component (read) | Use the module's hook from `lib/hooks/use-<module>.ts` |
| Mutation | Call the `lib/api/<module>.ts` function from an event handler, then revalidate with SWR `mutate` using the same key the hook uses |
