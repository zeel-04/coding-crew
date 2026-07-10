---
name: frontend-auth-and-state
description: Use when creating, editing, or reviewing route protection or client state — lib/dal.ts, middleware.ts, any Server Component or Server Action that reads session data, or filter/pagination/search state in page.tsx and client components. Enforces this project's Data Access Layer (verifySession) conventions and URL-first client state.
---

Auth is enforced where data is read, not where routes are rendered. `verifySession()` is a Data Access Layer helper that the base client calls on every request and Server Actions call whenever they need identity — middleware exists only for fast optimistic redirects. Client state defaults to the URL: filters, pagination, and search live in `searchParams` and drive the server read; the backend's data never gets duplicated into a client store. **Never treat a layout, page guard, or middleware as the only gate** — layouts don't re-render on navigation, and the edge can be bypassed; the backend's own 401 handling is the last line of defense, never the only one.

## Data Access Layer

`lib/dal.ts` owns `verifySession()` — the authoritative session check, assuming NextAuth v4 as an Authentik OIDC client. `import 'server-only'` keeps it out of client bundles; React `cache()` dedupes it to one session read per request no matter how many callers.

```ts
// lib/dal.ts
import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const verifySession = cache(async () => {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  return { user: session.user, accessToken: session.accessToken }
})
```

## Where verifySession is called

| Caller | Why |
|--------|-----|
| `apiFetch` in `lib/client.ts` | Every read and mutation is authenticated — no data leaves the backend without a session (see `frontend-api-layer`) |
| A Server Action needing more than "logged in" | Identity or role checks (`user.role`, ownership) as the action's first line — actions are network-callable endpoints |
| A page rendering the user's identity | Name in the header, role-gated UI — read it from `verifySession()`, never from a client-side store |

`cache()` makes this free: three callers in one request still cost a single session read.

## Middleware

Middleware is an **optimistic** redirect, not authorization — check that the session cookie exists and bounce to `/login` fast, before any rendering. **Never decode-and-trust the cookie in middleware as the authorization decision** — that's `verifySession()`'s job, next to the data.

```ts
// middleware.ts
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC = ['/login', '/post-login']

export function middleware(req: NextRequest) {
  if (PUBLIC.some((p) => req.nextUrl.pathname.startsWith(p))) return NextResponse.next()
  if (!req.cookies.has('next-auth.session-token')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

export const config = { matcher: ['/((?!api|_next|favicon.ico).*)'] }
```

## URL state

| State | Where it lives |
|-------|----------------|
| Filters, pagination, search, sort, active tab | URL `searchParams` — shareable, survives refresh, drives the server read |
| Data from the backend | Server Components via the feature's `api.ts` — never duplicated into a client store |
| Ephemeral UI (open dialog, hover, draft input) | Local `useState` |
| Genuinely cross-tree client state | Zustand — rare; justify it in the diff |

The page reads `searchParams` and passes them straight into the server read — changing a filter is a navigation, so the Server Component re-renders with fresh data and no client cache is involved:

```tsx
// app/departments/page.tsx
import { listDepartments } from '@/lib/features/departments/api'

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const { status, page } = await searchParams
  const departments = await listDepartments({ status, page: Number(page ?? 1) })
  return <DepartmentTable departments={departments} />
}
```

Filter controls write back to the URL — `router.replace` for filter changes (no history spam), and plain `<Link>` for pagination (each page is a navigation):

```tsx
'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export function StatusFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setStatus(status: string) {
    const params = new URLSearchParams(searchParams)
    status ? params.set('status', status) : params.delete('status')
    params.delete('page') // a filter change resets pagination
    router.replace(`${pathname}?${params}`)
  }
  // pagination: <Link href={`?page=${n}`}> — a navigation, not a state update
}
```
