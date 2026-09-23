# tRPC vs Server Actions — Deep Comparison

## Overview

This document captures the architectural comparison between tRPC and Server Actions for the NodeBase project. The decision impacts the entire data access layer, developer experience, and long-term maintainability.

---

## Architecture & Philosophy

| Aspect | tRPC | Server Actions |
|---|---|---|
| **Paradigm** | RPC (Remote Procedure Call) | Function serialization + HTTP |
| **Coupling** | Explicit contracts (router → procedures) | Implicit (function = endpoint) |
| **Transport** | HTTP POST (JSON-RPC style) | Form POST / `fetch` with special headers |
| **Schema** | Zod schemas on procedures | Zod/Valibot on function args |
| **Discovery** | Centralized router tree | Scattered across files |

**Key Insight**: tRPC forces you to **design your API surface explicitly**. Server Actions let you **accidentally create APIs** by exporting async functions.

---

## Type Safety — The Real Difference

### tRPC: Centralized, Explicit Types

```typescript
// Router (server) — single source of truth
export const userRouter = createTRPCRouter({
  getById: baseProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await db.user.findUnique({ where: { id: input.id } })
    })
})

// Client — FULL type inference, no manual types
const user = await trpc.user.getById.query({ id: 1 })
//    ^? User | null (fully typed with autocomplete)
```

### Server Actions: Distributed Types

```typescript
// lib/actions/user.ts
export async function getUserById(input: { id: number }) {
  return await db.user.findUnique({ where: { id: input.id } })
}

// Client — Works but less discoverable
import { getUserById } from '@/lib/actions/user'
const user = await getUserById({ id: 1 })
//    ^? Awaited<ReturnType<typeof getUserById>>
```

**Where tRPC Wins**:
- Centralized API surface — see ALL procedures in one router tree
- Explicit procedure types: `.query` vs `.mutation` vs `.subscription`
- Input/output transforms via `z.effect`, `z.transform`
- Middleware composition: `protectedProcedure`, `rateLimitedProcedure`
- Batch calls: `trpc.batch.query([...])` — single HTTP request

**Where Server Actions Win**:
- Zero boilerplate — just export an async function
- Direct TypeScript (Zod optional but recommended)
- Native `<form action={serverAction}>` integration

---

## Developer Experience

### tRPC Workflow
```typescript
// Adding endpoint: Modify router, types propagate instantly
export const userRouter = createTRPCRouter({
  updateProfile: protectedProcedure
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => { ... })
})

// Refactoring: Rename procedure → TS errors everywhere → fix all
```

### Server Actions Workflow
```typescript
// Adding endpoint: Create one function
// lib/actions/user.ts
export async function updateProfile(input: UpdateProfileInput) {
  const session = await auth()
  if (!session) throw new Error('Unauthorized')
  return await db.user.update({ ... })
}

// Client usage
'use client'
import { updateProfile } from '@/lib/actions/user'
```

**Verdict**: Server Actions faster for **prototyping**. tRPC faster for **maintaining**.

---

## Performance & Caching

| Scenario | tRPC + TanStack Query | Server Actions + Next.js Cache |
|---|---|---|
| **Request deduplication** | Built-in | Manual (`unstable_cache`) |
| **Prefetching** | `queryClient.prefetchQuery()` | Server Component `prefetch` |
| **Invalidation** | `queryClient.invalidateQueries()` | `revalidatePath()` / `revalidateTag()` |
| **Optimistic updates** | `onMutate` / `onError` / `onSettled` | Manual + `useTransition` |
| **Streaming/Real-time** | Subscriptions (WebSocket) | Not native (SSE workaround) |
| **Client bundle size** | +~15KB | Zero (server-only) |

**Critical Difference**: tRPC gives you a **client-side cache with sophisticated invalidation**. Server Actions rely on **Next.js server-centric cache primitives**.

---

## Authentication & Authorization

### tRPC: Middleware Composition (Clean)

```typescript
const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  const session = await getServerSession()
  if (!session) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, session } })
})

const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.session.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' })
  return next(ctx)
})

// Usage — explicit at call site
export const userRouter = createTRPCRouter({
  deleteUser: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(...)
})
```

### Server Actions: Repeated Logic

```typescript
export async function deleteUser(input: { id: number }) {
  const session = await auth()
  if (!session) throw new Error('Unauthorized')
  if (session.user.role !== 'admin') throw new Error('Forbidden')
  // Repeated in EVERY action that needs auth
}
```

**tRPC Advantage**: Authorization logic lives **once in middleware**, not repeated.

---

## Testing

| Approach | tRPC | Server Actions |
|---|---|---|
| **Unit testing** | Caller-based isolation | Direct function calls |
| **Integration testing** | Full contract testing | Manual HTTP testing |
| **Mocking** | `createCaller` with mock context | Standard function mocking |

**Server Actions win** for pure unit testing simplicity. **tRPC wins** for integration testing the full API contract.

---

## Migration & External Consumers

| Factor | tRPC | Server Actions |
|---|---|---|
| **Incremental adoption** | Harder (full setup needed) | Easy (add one function) |
| **Existing REST API** | Wrap with `httpBatchLink` | Call directly |
| **Public API / Mobile** | OpenAPI export (`trpc-openapi`) | Not designed for this |
| **Third-party consumers** | HTTP layer available | Native HTTP but no schema |

**If you need a public API**: Server Actions are **not designed for this**. tRPC can export OpenAPI specs via `trpc-openapi`.

---

## Next.js 15/16 Considerations

```typescript
// Server Actions caching — still evolving
export async function getUsers() {
  // Caching behavior changes between versions
  // 'use cache' directive, dynamicIO, etc.
  return await db.user.findMany()
}

// tRPC: Stable, explicit caching via TanStack Query
// staleTime, gcTime, refetchInterval — all explicit and documented
```

**Next.js caching is in flux**. TanStack Query's model is **stable and predictable**.

---

## NodeBase-Specific Analysis

| NodeBase Need | tRPC Fit | Server Actions Fit |
|---|---|---|
| **Workflow CRUD** | ✅ Excellent | ✅ Good |
| **Real-time execution updates** | ✅ Subscriptions | ❌ Not native |
| **Webhook endpoints** | ✅ Separate router | ⚠️ Awkward |
| **Public API for integrations** | ✅ OpenAPI export | ❌ Not designed |
| **Complex auth (orgs, roles)** | ✅ Middleware composition | ⚠️ Repeated logic |
| **Client-side optimistic updates** | ✅ Built-in | ⚠️ Manual |
| **Team onboarding** | ⚠️ Learning curve | ✅ Familiar patterns |

---

## Hidden Costs

### tRPC Hidden Costs
- Initial setup complexity (~6 files)
- Client bundle size (+15KB)
- Learning curve for team
- Version lock (client/server must match)
- Debugging: opaque POST bodies in network tab

### Server Actions Hidden Costs
- **No request deduplication** → accidental double-fetches
- **No built-in invalidation** → stale data bugs
- **Form-only mutations** → awkward for non-form interactions
- **Serialization limits** — no Dates, Sets, Maps, circular refs without SuperJSON
- **No middleware** → auth/checks repeated everywhere
- **Testing external consumers** — harder to mock

---

## Recommendation for NodeBase

### Use tRPC For (Core Domain)
- Workflows, nodes, executions CRUD
- Real-time execution streaming (subscriptions)
- Public API for webhook consumers
- Organization/team management with RBAC
- Client-side state: workflow status, polling, invalidation

### Use Server Actions For (Edge Cases)
- Form submissions (contact, settings, simple mutations)
- Auth callbacks (OAuth, magic links)
- Webhook receivers (Stripe, GitHub, etc.)
- File uploads
- Progressive enhancement (forms working without JS)

---

## Hybrid Approach (Recommended)

```typescript
// src/trpc/routers/_app.ts — Core domain APIs
export const appRouter = createTRPCRouter({
  workflows: workflowRouter,
  nodes: nodeRouter,
  executions: executionRouter,
  organizations: orgRouter,
})

// src/lib/actions/ — Forms & webhooks
export async function submitContactForm(data: ContactFormInput) { ... }
export async function stripeWebhookHandler(payload: StripeEvent) { ... }
export async function uploadWorkflowIcon(file: File) { ... }
```

---

## Decision Matrix

```
                    ┌─────────────────────────────────────────┐
                    │     What's your team size?              │
                    └──────────────────┬──────────────────────┘
                                       │
              ┌────────────────────────┴────────────────────────┐
              ▼                                                 ▼
         1-3 developers                                    4+ developers
              │                                                 │
              ▼                                                 ▼
    ┌─────────────────┐                              ┌─────────────────┐
    │ Server Actions  │                              │     tRPC        │
    │ + TanStack Query│                              │ (worth the      │
    │ for client cache│                              │  investment)    │
    └─────────────────┘                              └─────────────────┘
```

---

## Conclusion

The transcript author chose tRPC for **long-term maintainability on a large project** — this is the right call for NodeBase given the scope:

- Workflow automation platform
- Multi-tenant organizations (Clerk orgs)
- Real-time execution updates (Ingest + WebSockets)
- Public API for integrations
- Billing/subscriptions (Polar)
- Team collaboration features

**tRPC's explicit contracts, middleware composition, client-side cache, and OpenAPI export capability** directly address NodeBase's architectural needs.

---

*Documented as part of the build → learn → discuss → document approach.*