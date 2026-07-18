---
name: frontend-api-layer
description: Use when creating, editing, or reviewing the frontend data layer — lib/client.ts, or any feature's lib/features/<feature>/api.ts, schema.ts, or types.ts file. Enforces this project's server-first data conventions — server-only API client, schema-first Zod types, reads in Server Components, mutations via Server Actions, and error handling.
---

All backend communication happens on the server. Reads run in Server Components through a server-only base client and reach client components as props; mutations run in Server Actions followed by cache revalidation. Zod schemas are the single source of truth for types — every response is validated at runtime, so backend contract drift fails loudly at the network boundary instead of deep in the UI. **Never call raw `fetch` from a feature file or component** — always go through the base client. **Never fetch from a Client Component** — no SWR, no `useEffect` fetching, no hooks layer.

```
lib/
├── client.ts                # server-only base layer — session token, base URL, Zod validation, error normalization
├── dal.ts                   # verifySession() — see the frontend-auth-and-state skill
└── features/
    └── departments/
        ├── schema.ts        # departmentSchema, departmentUpdateSchema — Zod schemas only
        ├── types.ts         # Department, DepartmentUpdate — z.infer types only
        ├── api.ts           # 'use server' — reads (getDepartment) AND mutation actions
        │                    #   (updateDepartmentAction), all through apiFetch
        └── hooks.ts         # client-side UI-state hooks only (e.g. wrapping useActionState) — never data fetching
app/
└── departments/
    ├── page.tsx             # Server Component — awaits lib/features/departments/api.ts directly
    └── loading.tsx          # skeleton for first paint (see design-patterns, Loading states)
```

Dependency direction is one-way: `schema.ts` → `types.ts` → `api.ts` → components. `types.ts` is also fine for a component to import directly for prop typing — it pulls in only a type, never the Zod runtime. Central files used by every feature (`client.ts`, `dal.ts`) live directly in `lib/` — anything needed by two or more features graduates there, never duplicated into a feature. Nothing in `lib/` imports from `app/`, and one feature never imports another feature's `api.ts`.

## Schemas

One file per feature in `lib/features/<feature>/schema.ts` — Zod schemas as the source of truth, nothing else. **Never hand-write an interface that mirrors a backend response** — if the shape exists on the wire, it exists as a schema here.

```ts
// lib/features/departments/schema.ts
import { z } from 'zod'

export const departmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  managerEmail: z.email(),
})
export const departmentUpdateSchema = departmentSchema.omit({ id: true }).partial()
```

## Types

One file per feature in `lib/features/<feature>/types.ts` — types derived from the sibling `schema.ts` via `z.infer`, named after the domain concept rather than the schema, plus any plain const value objects for fixed value sets (see below). No Zod runtime ever lands here. Keeping this separate from `schema.ts` means a component that only needs the TS shape (e.g. to type a prop) imports `types.ts` and never drags in the Zod runtime — only server code that actually validates imports `schema.ts`.

```ts
// lib/features/departments/types.ts
import type { z } from 'zod'
import type { departmentSchema, departmentUpdateSchema } from './schema'

export type Department = z.infer<typeof departmentSchema>
export type DepartmentUpdate = z.infer<typeof departmentUpdateSchema>
```

### Enums / fixed value sets

When a field is one of a fixed set of values (a `role` of `OWNER` or `MEMBER`, a `status`), define a **const object plus a derived union** in `types.ts` — never the TS `enum` keyword, and never scatter the same string literals across components. The const object is a plain value (no Zod runtime), so it lives here alongside the types, and `schema.ts` derives its validator from it. Keep the string values identical to the backend `TextChoices` values — these are exactly what the API sends and receives.

```ts
// lib/features/departments/types.ts
export const Role = { OWNER: 'OWNER', MEMBER: 'MEMBER' } as const
export type Role = (typeof Role)[keyof typeof Role]
```

```ts
// lib/features/departments/schema.ts
import { Role } from './types'

export const memberSchema = z.object({
  role: z.enum(Object.values(Role) as [Role, ...Role[]]),
})
```

Components import `Role` from `types.ts` for both the value (e.g. `Role.OWNER`) and the type — one source, no duplicated literals.

## Server-only base client

`lib/client.ts` is the only file that owns the session token, the base URL, response validation, and error normalization. The `'server-only'` import makes bundling it into client code a build error — the backend URL and bearer token never reach the browser.

```ts
// lib/client.ts
import 'server-only'
import { z } from 'zod'
import { verifySession } from '@/lib/dal'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit,
): Promise<T> {
  const { accessToken } = await verifySession()
  const res = await fetch(`${process.env.API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...options?.headers,
    },
  })

  if (!res.ok) throw new ApiError(res.status, await res.text())
  return schema.parse(await res.json()) // runtime validation — drift fails loudly, at the seam
}
```

Note `API_URL`, not `NEXT_PUBLIC_API_URL` — the URL is a server secret now. `verifySession()` (from `lib/dal.ts`, see `frontend-auth-and-state`) runs on every call, so the backend's own 401 handling is the last line of defense, never the only one.

## Feature API files

One file per feature in `lib/features/<feature>/api.ts`, with `'use server'` at the top. It exports async server functions for that feature's endpoints — reads and mutation actions alike, all through `apiFetch`, typed by the sibling `schema.ts`. Because every export of a `'use server'` file is a network-callable endpoint, **every function must go through `apiFetch`** (which verifies the session) — never export a helper that skips it. Mutation actions additionally `safeParse` their input before touching the backend and revalidate after.

```ts
// lib/features/departments/api.ts
'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { apiFetch } from '@/lib/client'
import {
  departmentSchema,
  departmentUpdateSchema,
} from '@/lib/features/departments/schema'

// reads — awaited directly from Server Components
export async function getDepartment(id: string) {
  return apiFetch(`/departments/${id}`, departmentSchema)
}

export async function listDepartments() {
  return apiFetch('/departments', z.array(departmentSchema))
}

// mutation — bound with useActionState in forms, or startTransition elsewhere
export type FormState = {
  errors?: Record<string, string[]>
  values?: Record<string, string>
} | null

export async function updateDepartmentAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>
  const parsed = departmentUpdateSchema.safeParse(raw) // actions are public endpoints — never trust the caller
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors, values: raw }
  }
  await apiFetch(`/departments/${id}`, departmentSchema, {
    method: 'PATCH',
    body: JSON.stringify(parsed.data),
  })
  revalidatePath(`/departments/${id}`)
  return null
}
```

An action that needs identity or role checks beyond "logged in" calls `verifySession()` explicitly as its first line.

## Fetching and mutating by context

| Context | Pattern |
|---------|---------|
| Server Component (read) | `await` the feature's `api.ts` function directly; slow branches behind Suspense / `loading.tsx` skeleton |
| Client Component (read) | Never fetches — receives server data as props |
| Form mutation | Server Action from the feature's `api.ts`, bound with `useActionState` |
| Non-form mutation (delete, toggle, reorder) | Same Server Action, invoked via `startTransition` from the event handler |
| After any mutation | `revalidatePath`/`revalidateTag` inside the action — never a client-side refetch |
| Filters / pagination / search | URL `searchParams`, not client state — see `frontend-auth-and-state` |

## Reads — Server Components

```tsx
// app/departments/[id]/page.tsx
import { getDepartment } from '@/lib/features/departments/api'

export default async function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const department = await getDepartment(id)
  return <DepartmentDetail department={department} />
}
```

While the server fetch runs, `loading.tsx` (or a `<Suspense>` boundary) shows a skeleton mirroring the populated layout — the first-paint rule in `design-patterns`, Loading states.

## Mutations — Server Actions

**Form mutation** — bind the action with `useActionState`; `pending` drives the submit button, returned `errors` fill the inline slots, and returned `values` are echoed back through `defaultValue` so nothing the user typed is lost:

```tsx
'use client'
import { useActionState } from 'react'
import { updateDepartmentAction } from '@/lib/features/departments/api'
import type { Department } from '@/lib/features/departments/types'

export function EditDepartmentForm({ department }: { department: Department }) {
  const [state, formAction, pending] = useActionState(
    updateDepartmentAction.bind(null, department.id),
    null,
  )

  return (
    <form action={formAction}>
      <Input
        name="name"
        defaultValue={state?.values?.name ?? department.name}
        aria-describedby="name-error"
      />
      {state?.errors?.name && (
        <p id="name-error" className="text-xs text-destructive">{state.errors.name[0]}</p>
      )}
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}
```

**Non-form mutation** — same action, invoked through `useTransition`:

```tsx
'use client'
import { useTransition } from 'react'
import { deleteDepartmentAction } from '@/lib/features/departments/api'

export function DeleteDepartmentButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="destructive"
      disabled={pending}
      onClick={() => startTransition(() => deleteDepartmentAction(id))}
    >
      Delete
    </Button>
  )
}
```

The `revalidatePath`/`revalidateTag` call inside the action refreshes every Server Component that rendered the data — there is no client cache to reconcile.

## Forms

Form mechanics live here (`useActionState` + Server Action + server-side `safeParse`); form UX — field anatomy, validation timing, submit-button states — lives in `design-patterns`, Forms. Client-side Zod (directly or via react-hook-form as the client layer) may give instant on-blur feedback, but the Server Action re-validates with `safeParse` regardless — client validation is UX, server validation is the contract.

## Error handling

Catch `ApiError` only at the call site that can meaningfully respond to a specific status.

```ts
try {
  return await getDepartment(id)
} catch (err) {
  if (err instanceof ApiError && err.status === 404) {
    notFound()
  }
  throw err
}
```

- **Never swallow an error silently.** With no recoverable path at the call site, let it propagate to the nearest `error.tsx` boundary.
- **A `ZodError` from `schema.parse` means the backend contract drifted.** Let it hit `error.tsx` and fix the schema — never `.catch` it into a default value.
- **Inside Server Actions**, expected failures (validation, a 4xx you can name) return typed state; unexpected ones throw.

## Toward generated types

Hand-maintained Zod schemas are the interim state — they make backend drift loud, but they are still mirrors kept in sync by hand. The target is generating them from the Django OpenAPI schema (drf-spectacular on the backend, `openapi-typescript` or a Zod-emitting generator on the frontend), so the backend contract becomes the literal source of truth. Until then, a schema change on the backend means a matching edit in `schema.ts` — caught at runtime by `apiFetch` if missed.
