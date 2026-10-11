# File Structure Philosophy: Layout-Driven Organization

**Lecture:** 09 — Dashboard Layout & File Structure  
**Date:** 2026-10-11  
**Status:** Documented for reference

---

## Core Principle

> **"Structure follows layout, not features."**

The file tree *is* the layout tree. When you need a new layout variant, you create a new route group. When entities share layout, they live in the same group. This scales because **layouts change less often than features**.

---

## Before vs After (Lecture 09)

### Before (Flat Structure)
```
src/app/
├── page.tsx              # Home: auth + test AI + logout (cluttered)
├── logout.tsx            # Standalone component
├── text-ai-test.tsx      # Test component
├── layout.tsx            # Root layout with providers
├── (auth)/               # Auth route group
│   ├── login/page.tsx
│   └── signup/page.tsx
└── api/                  # API routes
```

### After (Layout-Driven Structure)
```
src/app/
├── (auth)/               # Auth routes (unchanged)
│   ├── login/page.tsx
│   └── signup/page.tsx
├── (dashboard)/          # Dashboard route group (shared sidebar layout)
│   ├── layout.tsx        # SidebarProvider + SidebarInset + AppSidebar
│   ├── rest/             # Shared "list/detail" layout
│   │   ├── layout.tsx    # AppHeader + main content area
│   │   ├── workflows/page.tsx
│   │   ├── credentials/page.tsx
│   │   ├── credentials/[credentialId]/page.tsx
│   │   ├── executions/page.tsx
│   │   └── executions/[executionId]/page.tsx
│   └── editor/           # Editor-specific layout (canvas, node palette)
│       └── workflows/[workflowId]/page.tsx
├── layout.tsx            # Root: only providers (Tooltip, TRPC, Toaster)
├── global-error.tsx      # Sentry error boundary
├── sentry-example-page/  # Sentry test page
└── api/
```

---

## Philosophy Pillars

### 1. Route Groups = Layout Boundaries

| Route Group | Purpose | Shared Layout |
|-------------|---------|---------------|
| `(auth)` | Authentication pages | AuthLayout (centered card, no sidebar) |
| `(dashboard)` | All authenticated app pages | SidebarProvider + persistent sidebar |
| `rest` | List & detail views | AppHeader + main content |
| `editor` | Visual workflow editor | Canvas header + node palette + ReactFlow canvas |

**Rule:** Parentheses `()` = **organizational only**, no URL segment.

### 2. Colocation by Shared Layout, Not Feature

```
❌ Feature-based (traditional)
features/
├── workflows/
│   ├── list/page.tsx
│   ├── editor/[id]/page.tsx
│   └── components/
├── credentials/
│   ├── list/page.tsx
│   └── detail/[id]/page.tsx
└── executions/
    ├── list/page.tsx
    └── detail/[id]/page.tsx

✅ Layout-based (lecture approach)
(dashboard)/
├── rest/
│   ├── workflows/page.tsx           # List
│   ├── credentials/page.tsx         # List
│   ├── credentials/[credentialId]/  # Detail
│   ├── executions/page.tsx          # List
│   └── executions/[executionId]/    # Detail
└── editor/
    └── workflows/[workflowId]/page.tsx  # Editor (different layout!)
```

**Why?** Workflows exist in **two layouts**: list view (`rest`) and editor (`editor`). Feature folders force duplication or awkward cross-references.

### 3. Dynamic Routes Mirror Entity Relationships

| Route | Layout | Purpose |
|-------|--------|---------|
| `/workflows` | `rest` | List all workflows |
| `/workflows/[workflowId]` | `editor` | Visual editor (canvas) |
| `/credentials` | `rest` | List credentials |
| `/credentials/[credentialId]` | `rest` | Credential detail |
| `/executions` | `rest` | List executions |
| `/executions/[executionId]` | `rest` | Execution detail |

**Naming convention:** `[entityId]` with **capital I** (`credentialId`, `executionId`, `workflowId`) — matches `params` destructuring.

### 4. Root Redirect as Default Entry Point

```typescript
// next.config.ts
export default withSentryConfig(nextConfig, {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/workflows",
        permanent: false,  // Dev-friendly: no browser caching
      },
    ];
  },
});
```

#### How It Works

| Property | Value | Meaning |
|----------|-------|---------|
| `source` | `"/"` | Matches root URL (`http://localhost:3000/`) |
| `destination` | `"/workflows"` | Redirects to workflow list page |
| `permanent` | `false` | **307 Temporary Redirect** (not 301) |

**Flow:**
```
User visits http://localhost:3000/
       │
       ▼
Next.js matches source: "/"
       │
       ▼
Returns 307 redirect to /workflows
       │
       ▼
Browser follows → http://localhost:3000/workflows
       │
       ▼
(dashboard)/rest/workflows/page.tsx renders
```

#### Why `permanent: false`?

| Value | HTTP Status | Browser Behavior |
|-------|-------------|------------------|
| `true` | **301 Moved Permanently** | Caches aggressively; hard to undo; affects *all* localhost projects on same domain |
| `false` | **307 Temporary Redirect** | No caching; safe for dev; easy to change later |

**Lecture rationale:** "If you have any other Next.js projects on your machine setting permanent to true will make them redirect the root page to workflows as well."

#### Why Not Middleware?

```typescript
// middleware.ts (alternative approach)
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/workflows", request.url));
  }
}
```

**Lecture preference:** `next.config.ts` redirects are:
- **Declarative** — config, not code
- **Edge-free** — runs at build/routing layer, not per-request
- **Simpler** — no middleware file, no matcher config

#### When to Use `permanent: true`

Only in **production** when:
- URL structure is finalized
- SEO requires canonical URLs
- You want search engines to update indexes

```typescript
// Production-ready version
permanent: process.env.NODE_ENV === "production",
```

- **Workflows = primary entity** → default landing page
- `permanent: false` prevents caching issues across local projects

### 5. Per-Page Auth > Middleware Auth

```tsx
// Every dashboard page
export default async function WorkflowsPage() {
  await requireAuth();  // Explicit, visible, page-level
  return <WorkflowsContent />;
}
```

| Approach | Role |
|----------|------|
| **Middleware** | UX helper — redirects unauthenticated users |
| **requireAuth()** | Actual security boundary — matches tRPC `protectedProcedure` |
| **tRPC protectedProcedure** | API security — validates session on every call |

**Philosophy:** Explicit > Implicit for security. You see exactly which pages need auth.

### 6. Component Organization

```
src/components/
├── ui/                    # shadcn primitives (never modify)
│   ├── button.tsx
│   ├── sidebar.tsx
│   └── ...
├── app-sidebar.tsx        # App-specific sidebar composition
├── app-header.tsx         # App-specific header composition
└── ...                    # Other app-level compositions
```

- `ui/` = **library code** (upgradable via `shadcn add`)
- `app-*` = **your compositions** (owned, customized)

---

## Scaling Benefits

### Adding a New Entity (e.g., "Templates")
```
(dashboard)/rest/
├── templates/page.tsx
└── templates/[templateId]/page.tsx
```
- Drops into existing `rest` layout automatically
- Gets sidebar, header, auth for free

### Adding a New Layout Variant (e.g., "Settings")
```
(dashboard)/settings/
├── layout.tsx      # New layout (maybe two-column)
├── profile/page.tsx
└── billing/page.tsx
```
- New route group = new layout boundary
- No impact on `rest` or `editor`

### Moving an Entity Between Layouts
If credentials need an editor later:
```
(dashboard)/editor/credentials/[credentialId]/page.tsx
```
- Just create the file — structure expresses intent

---

## Key Takeaways

1. **Route groups are layout contracts** — name them after what they share
2. **Dynamic routes use `[entityId]`** — capital I, matches params type
3. **Root redirect** points to primary entity (`/workflows`)
4. **Auth at page level** — visible, explicit, matches API layer
5. **Components split by ownership** — `ui/` (theirs) vs `app-*` (yours)
6. **Structure = documentation** — new devs understand layout from file tree

---

## Related Docs

- `docs/error-tracing-observability.md` — Sentry integration
- `docs/data-access-layer.md` — tRPC as security boundary
- `docs/nextjs-request-flow-security.md` — Proxy vs App layer

---

*Updated as project evolves. Next: Editor layout implementation (Lecture 10+).*