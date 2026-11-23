# URL State Management — First Principles

## Overview

This document captures the framework-agnostic first principles of URL state management: the distinction between path parameters and query/search parameters, and how to handle them regardless of which frontend or backend framework you use.

---

## 1. URL Anatomy

A URL has this structure:

```
scheme://host:port/path?query#fragment
```

Example:
```
https://app.nodebase.com/workflows?page=2&search=horse#section-top
```

| Part | Example | Purpose |
|------|---------|---------|
| Scheme | `https` | Protocol |
| Host | `app.nodebase.com` | Server address |
| Port | `:3000` | Network port |
| Path | `/workflows` | Resource location |
| Query | `?page=2&search=horse` | Optional modifiers |
| Fragment | `#section-top` | Client-only anchor (never sent to server) |

**Core principle:** The path identifies *which resource* you are requesting. The query modifies *how that resource is presented or filtered*.

---

## 2. Path Parameters

### What They Are

Values embedded directly in the URL path to identify a specific resource.

```
GET /workflows/abc-123
              └───────┘
               path parameter: workflow ID
```

### Characteristics

| Property | Description |
|----------|-------------|
| Purpose | Identifies a specific instance of a resource |
| Requirement | Required — removing it changes the route meaning |
| Structural | Part of the URL hierarchy |
| Cardinality | Usually one value per path segment |
| Defaults | No sensible default — absence usually means "list all" or 404 |

### When to Use

- Viewing one specific workflow: `/workflows/{id}`
- Editing one specific user: `/users/{userId}/settings`
- Any resource with a unique identity

### First-Principles Rule

Path parameters answer: **"Which resource?"**

---

## 3. Query / Search Parameters

### What They Are

Key-value pairs appended after the `?` in the URL, separated by `&`.

```
GET /workflows?page=2&search=horse&sort=desc
          └─┬─┘ └─────┬─────┘ └──────┬──────┘
           key    value       key     value
```

### Characteristics

| Property | Description |
|----------|-------------|
| Purpose | Modifies a list or view presentation |
| Requirement | Optional — omitting them should produce sensible defaults |
| Cardinality | Unlimited — you can have many keys and values |
| Order | Order-independent (`?a=1&b=2` === `?b=2&a=1`) |
| Type | Everything is a string |

### When to Use

- Pagination: `?page=2&pageSize=10`
- Search/filter: `?search=horse&status=active`
- Sorting: `?sort=updatedAt&order=desc`
- UI preferences: `?theme=dark&view=list`

### First-Principles Rule

Query parameters answer: **"How should this list be filtered, sorted, or paginated?"**

---

## 4. Five Universal Operations

Regardless of framework, you always perform these five operations when dealing with URL state:

### A. Extraction (Reading)
Pull the value out of the URL.
- Path: Extract from path segments (e.g., segment 2 of `/workflows/{id}`)
- Query: Extract from the query string after `?`

### B. Parsing (String → Native Type)
Everything in a URL is a string. Convert to the type your app needs.

```
"2"          →  2            (number)
"true"       →  true         (boolean)
"horse"      →  "horse"      (string)
""           →  null/empty   (optional)
```

**Rule:** Never trust raw string values. Always parse.

### C. Validation (Reject Bad Input)
After parsing, validate bounds and constraints.

- Path param ID: Must match UUID format? Must exist in DB?
- Query param page: Must be ≥ 1? Must be ≤ 1000?
- Query param search: Must not exceed 500 characters?

**Rule:** Reject invalid values with a clear error before they reach business logic.

### D. Serialization (Native Type → String)
When the user changes state in your UI, write it back to the URL.

```
2           →  "2"
true        →  "true"
{ a: 1 }    →  "a=1"         (objects need encoding)
```

**Rule:** Round-trip must be lossless for the types you support.

### E. Two-Way Synchronization
The URL and your UI state must stay in sync in both directions:

| Direction | Trigger | Action |
|-----------|---------|--------|
| URL → UI | Page load, back button, shared link | Read URL → update UI |
| UI → URL | User clicks button, types in input | Update UI → write to URL |
| External → URL | User manually edits address bar | Detect change → update UI |

**Rule:** If you update UI state without writing to the URL, the back button breaks and sharing loses context.

---

## 5. Decision Framework: Path vs Query

| Question | Path Param | Query Param |
|----------|-----------|-------------|
| Identifies one specific resource? | Yes | No |
| Optional with a sensible default? | No | Yes |
| Many of them? | No (1–2 max) | Yes (unlimited) |
| User shares this exact state? | Rarely | Often |
| Changes resource identity? | Yes | No |

### Examples

| URL | Parameter Type | Reasoning |
|-----|---------------|-----------|
| `/workflows/abc-123` | Path | Identifies one specific workflow |
| `/workflows?page=2` | Query | Still workflows, just a different slice |
| `/workflows/abc-123?tab=settings` | Both | Path identifies the workflow; query selects the tab view |

---

## 6. Application to NodeBase Workflows

### Workflows List Page — Query Parameters Only

| Param | Type | Why |
|-------|------|-----|
| `page` | Query | Modifies which slice of the list to show |
| `pageSize` | Query | Modifies how many items per page |
| `search` | Query | Modifies which items match the filter |

**Why query params:** You are viewing a collection, not one resource. All params are optional (defaults exist). Users should share, filter, and bookmark specific list states.

### Workflow Detail Page — Path Parameter

| Param | Type | Why |
|-------|------|-----|
| `workflowId` | Path | Identifies one specific workflow to view/edit |

**Why path param:** You are viewing one specific resource by ID. The ID is required (no sensible default).

---

## 7. Common Pitfalls

| Pitfall | Problem | Correct Approach |
|---------|---------|------------------|
| Search/filter in path | `/workflows/search/horse/page/2` gets messy fast | Use query params for filters: `?search=horse&page=2` |
| Required ID in query | `/workflows?id=abc-123` works but is less RESTful | Use path params: `/workflows/abc-123` |
| Forgetting URL encoding | Spaces/special chars break URLs (`horse shoe` → `horse%20shoe`) | Always encode values when writing to URL |
| Missing values | Query params can be absent; path params missing → 404 | Always define query param defaults; validate path params |
| Sensitive data in URL | Query params appear in browser history, server logs, referrer headers | Never put passwords, tokens, or PII in query strings |

---

## 8. Summary Table

| Concept | Path Parameters | Query Parameters |
|---------|----------------|------------------|
| Answers | "Which resource?" | "How should this list be filtered/sorted/paginated?" |
| Required? | Yes | No |
| Defaults | None | Yes (should define) |
| Max count | 1–2 typically | Unlimited |
| Order matters? | Yes (positional) | No |
| Shared via link? | Rarely | Often |
| Example | `/workflows/{id}` | `?page=2&search=horse` |

---

## 9. NodeBase Implementation Notes

In NodeBase, query parameters are managed via **nuqs**:

- `src/features/workflows/params.ts` defines the param schema (`page`, `pageSize`, `search`) with types, defaults, and `clearOnDefault`
- `src/features/workflows/server/params-loader.ts` parses incoming server-side `searchParams` via nuqs `createLoader`
- `src/features/workflows/hooks/use-workflows-params.tsx` reads/writes client-side URL state via nuqs `useQueryStates`
- `src/features/workflows/server/routers.ts` receives the typed params as tRPC input for `getMany`

The config values live in `src/config/constant.ts`:

```ts
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 1,
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 1,
};
```

---

*Documented as part of the build → learn → discuss → document approach.*
