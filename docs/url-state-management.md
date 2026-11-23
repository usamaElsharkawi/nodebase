# URL State Management — Conceptual Overview

## Overview

This document captures the concept of **URL state management** as applied to the NodeBase workflows feature. URL state management means storing UI state (pagination, search, filters) in the browser's address bar as query parameters instead of only in local component state (`useState`).

The decision impacts user experience, shareability, refresh behavior, and server-side prefetching.

---

## The Problem: Local State vs URL State

### Local State (`useState`)

```typescript
// Component owns the state
const [search, setSearch] = useState("")
const [page, setPage] = useState(1)
```

**Lifecycle:**
1. User types "horse" → component state becomes `"horse"`
2. User refreshes → state resets to `""`
3. User copies URL and sends to a friend → friend sees an empty search box
4. User clicks browser Back → nothing happens (URL didn't change)

**Problem:** State is trapped in browser memory. It dies on refresh and cannot be shared.

### URL State

```http
http://localhost:3000/workflows?page=2&search=horse
                                      └────────────────┘
                                       this is URL state
```

**Lifecycle:**
1. User types "horse" → URL updates to `?search=horse`
2. User refreshes → browser still has `?search=horse` → app reads it and shows results immediately
3. User copies URL → friend opens it and sees the exact same filtered results
4. User clicks browser Back → URL changes → UI updates to previous state

**Benefit:** The URL *is* the state. It persists across refreshes, is bookmarkable, and shareable.

---

## Mental Model Shift

Most developers start by thinking:

> "The component owns the state. The URL just happens to be there."

URL state management flips this:

> "The URL owns the state. The component is just a reflection of what's in the URL."

When the user changes something in the UI, you update the URL. When the URL changes (back button, refresh, shared link), the UI updates to match.

---

## Path Params vs Query Params

| Type | Example | Use Case |
|------|---------|----------|
| **Path parameters** | `/workflows/123` | Identifying a specific resource |
| **Query parameters** | `/workflows?page=2&search=horse` | Filtering, sorting, pagination, optional UI preferences |

For workflows:
- `page`, `pageSize`, `search` are **query parameters** — they modify a list view
- `workflowId` is a **path parameter** — it identifies a specific workflow

---

## Serialization: The Hidden Challenge

Everything in a URL is a **string**.

```
?page=2        → value "2" is a string
?search=horse  → value "horse" is a string
```

URL state management always involves two steps:

1. **Parsing (URL → App):** Convert string `"2"` into number `2`, validate bounds, handle missing values
2. **Serializing (App → URL):** Convert number `2` back into string `"2"` and write to address bar

Without validation, a user could type `?page=-5` or `?page=abc` and crash your pagination math.

---

## Two-Way Synchronization

URL state only works if both directions stay in sync:

| Direction | What Happens |
|-----------|-------------|
| **URL → UI** | On page load, read `?page=2` and show page 2 |
| **UI → URL** | User clicks "Next" → update URL to `?page=3` |
| **External → UI** | Browser Back button changes URL → UI updates |
| **External → URL** | User shares link → friend's UI matches |

If you only do one direction, the system breaks. Updating local state without writing to the URL means Back/refresh lose user context.

---

## Client-Side vs Server-Side URL State

### Client-Side
Browser reads/writes URL via JavaScript without page reload. Used when a user clicks pagination buttons and the page updates instantly.

### Server-Side (Next.js App Router)
When a user visits `/workflows?page=2&search=horse`, the server reads query params **before** sending HTML. This is prefetching/SSR. The server runs your tRPC `getMany` procedure with `page=2` and `search=horse` so the initial HTML already contains the right data.

If the server ignores URL params, the user sees page 1 on first load, then client JavaScript corrects to page 2 — causing a flash of wrong content.

---

## Concrete Example: Workflows Page

User journey:

1. Opens `/workflows` — sees 5 workflows (page 1)
2. Types "horse" — URL becomes `/workflows?search=horse` — sees 1 result
3. Clicks "Next" — URL becomes `/workflows?search=horse&page=2` — sees empty page (only 1 result exists)
4. Clicks browser Back — URL becomes `/workflows?search=horse` — back to page 1, horse result still visible
5. Copies URL, sends to coworker — coworker opens it and immediately sees horse result on page 1
6. Refreshes — still sees horse result on page 1

**Without URL state:** Steps 2–6 reset to page 1 with no search. User loses context on every refresh, can't share filtered views, Back button is useless.

---

## Trade-Offs

**Pros:**
- Shareable links
- Refresh persistence
- Back/forward button support
- Bookmarkable filtered views
- Server can preload the right data on first hit

**Cons:**
- URL length limits (browsers handle ~2,000 characters; stay well under)
- **Never** put sensitive data (passwords, PII, tokens) in URLs — they're logged in browser history, server logs, and referrer headers
- More complexity: parsing, validation, two-way sync logic required

---

## Application to NodeBase

Your `getMany` tRPC procedure accepts `page`, `pageSize`, and `search`. These are ideal URL state candidates because:

- They're optional (have defaults from `PAGINATION` config)
- They change frequently as the user browses
- They affect what data is shown
- Users should be able to share or refresh and keep their filters

### Connection to `config/constants.ts`

```
PAGINATION.DEFAULT_PAGE: 1        → Default when ?page= is absent
PAGINATION.DEFAULT_PAGE_SIZE: 5   → Default when ?pageSize= is absent
PAGINATION.MIN_PAGE_SIZE: 1       → Zod validation guard against 0/negative
PAGINATION.MAX_PAGE_SIZE: 100     → Zod validation guard against huge pages
```

### Connection to `routers.ts`

```typescript
getMany: protectedProcedure
  .input(z.object({
    page: z.number().default(PAGINATION.DEFAULT_PAGE),
    pageSize: z.number()
      .min(PAGINATION.MIN_PAGE_SIZE)
      .max(PAGINATION.MAX_PAGE_SIZE)
      .default(PAGINATION.DEFAULT_PAGE_SIZE),
    search: z.string().default(""),
  }))
  .query(async ({ ctx, input }) => {
    const { page, pageSize, search } = input;

    const [items, totalCount] = await Promise.all([
      prisma.workflow.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        where: {
          userId: ctx.auth.user.id,
          name: { contains: search, mode: "insensitive" },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.workflow.count({
        where: {
          userId: ctx.auth.user.id,
          name: { contains: search, mode: "insensitive" },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / pageSize);
    return { items, page, pageSize, totalCount, totalPages, ... };
  });
```

Note: `count` uses the **same `where`** as `findMany`. If they diverge, `totalPages` will be wrong (this was a bug caught during the tutorial).

---

## Libraries That Implement This Pattern

**nuqs** — URL state management for React/Next.js:
- Client: `useQueryStates` reads/writes URL params like `useState`
- Server: `createLoader` parses incoming `searchParams` into typed values
- Adapter: `nuqs/adapters/next/app` integrates with Next.js App Router
- Provides type-safe parsing (integer, string, boolean, etc.) and `clearOnDefault` to keep URLs clean

Alternative approaches:
- Next.js native `useSearchParams` / `server.searchParams` — manual, verbose, no type safety built-in
- Custom `useEffect` + `router.push` — error-prone, easy to forget two-way sync

---

## When to Use URL State

✅ **Use URL state for:**
- Pagination (`page`, `pageSize`)
- Search/filter text (`search`)
- Sort options (`sortBy`, `sortOrder`)
- Tab selection (`tab=analytics`)
- Date ranges (`startDate`, `endDate`)
- Any UI state the user might want to share or return to

❌ **Do NOT use URL state for:**
- Sensitive data (passwords, emails, tokens)
- Large objects or arrays (URL length limits)
- Ephemeral UI state (modal open/closed, hover states, form drafts before submit)
- Data that changes every few milliseconds (cursor position, scroll position)

---

## Summary

| Concept | Local State | URL State |
|---------|-------------|-----------|
| Storage | Component memory | Browser address bar |
| Refresh | Lost | Preserved |
| Shareable | No | Yes (copy link) |
| Back button | No effect | Restores previous state |
| Server prefetch | Client-only | Server can read params on first hit |
| Complexity | Low | Medium (parsing + validation) |

URL state management treats the address bar as the source of truth for UI configuration state, making your app more predictable, shareable, and resilient to refreshes.

---

*Documented as part of the build → learn → discuss → document approach.*
