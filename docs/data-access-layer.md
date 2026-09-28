# Data Access Layer — Architecture & Implementation

## Overview

The Data Access Layer (DAL) is the **single abstraction** between your application code and your database. In NodeBase, the DAL is implemented as **tRPC procedures + Prisma client + BetterAuth adapter**.

---

## What Is the Data Access Layer?

```
┌─────────────────────────────────────────────────────────────────┐
│                        APPLICATION CODE                          │
│  (Components, API routes, Server Actions, tRPC procedures)      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DATA ACCESS LAYER                            │
│  (tRPC procedures, Prisma queries, BetterAuth adapters)         │
│  • All database queries live HERE                                │
│  • All authorization checks live HERE                            │
│  • All data transformations live HERE                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATABASE                                  │
│  (PostgreSQL via Prisma)                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## In NodeBase: DAL = tRPC + Prisma + BetterAuth

| Component | Role |
|-----------|------|
| **tRPC Procedures** | Define *what data operations exist* (getUser, createWorkflow, deleteNode) |
| **protectedProcedure** | Enforce *who can access what* (auth middleware) |
| **Prisma Client** | Execute *how data is queried* (type-safe SQL) |
| **BetterAuth Adapter** | Handle *auth-specific data* (sessions, accounts, users) |

---

## Why Is It Important?

### 1. Single Source of Truth for Data Access

**Without DAL** — queries scattered everywhere:
```typescript
// app/page.tsx
const user = await prisma.user.findUnique({ where: { id: 1 } });

// app/api/users/route.ts
const user = await prisma.user.findUnique({ where: { id: 2 } });

// components/UserProfile.tsx
const user = await prisma.user.findUnique({ where: { id: 3 } });
```

**With DAL** — all queries in ONE place:
```typescript
// trpc/routers/user.ts
export const userRouter = createTRPCRouter({
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => ctx.db.user.findUnique({ where: { id: input.id } })),
  
  updateProfile: protectedProcedure
    .input(updateProfileSchema)
    .mutation(({ ctx, input }) => ctx.db.user.update({ where: { id: ctx.user.id }, data: input })),
});
```

---

### 2. Authorization Lives With Data (Not Scattered)

```typescript
// Without DAL — auth checks everywhere (or missing)
async function deleteUser(userId: string) {
  await prisma.user.delete({ where: { id: userId } });
}

// With DAL — auth is PART of the data access
export const userRouter = createTRPCRouter({
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'ADMIN' && ctx.user.id !== input.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return ctx.db.user.delete({ where: { id: input.id } });
    }),
});
```

---

### 3. Single Place to Change Data Logic

| Change | Without DAL | With DAL |
|--------|-------------|----------|
| Add soft delete | Find 47 files | Update 1 procedure |
| Add audit logging | Find 47 files | Add middleware in 1 place |
| Change DB schema | Break 47 files | Update 1 procedure |
| Add rate limiting | Find 47 files | Add middleware in 1 place |
| Switch DB provider | Rewrite 47 files | Update Prisma client in 1 place |

---

### 4. Type Safety End-to-End

```
Database Schema (Prisma)
        │
        ▼
Prisma Client (TypeScript types)
        │
        ▼
tRPC Procedures (Input/Output validation with Zod)
        │
        ▼
tRPC Router (Full API type definition)
        │
        ▼
Client Hooks (useQuery, useMutation — fully typed)
        │
        ▼
Components (TypeScript knows exact shapes)
```

---

### 5. Testing Becomes Possible

```typescript
const caller = appRouter.createCaller(testContext);

const user = await caller.user.getById({ id: '123' });
expect(user.email).toBe('test@example.com');

await expect(
  caller.user.delete({ id: 'other-user' })
).rejects.toThrow(TRPCError);
```

---

## Why Do We Need to Implement It?

### NodeBase-Specific Requirements

| Requirement | How DAL Solves It |
|-------------|-------------------|
| **Multi-tenant workflows** | `protectedProcedure` checks org membership before every query |
| **Workflow ownership** | Procedures check `workflow.userId === ctx.user.id` |
| **Node execution permissions** | Procedures validate user can read/write node data |
| **Audit trail** | Middleware logs every mutation automatically |
| **Rate limiting** | Middleware applies per-user limits on expensive operations |
| **Data consistency** | All queries use same Prisma client, same transaction patterns |

---

## The Alternative (And Why It Fails)

```
WITHOUT DATA ACCESS LAYER:
Component A ──► prisma.user.findUnique()
Component B ──► prisma.user.findUnique()
API Route   ──► prisma.user.findUnique()
Server Action ──► prisma.user.findUnique()
tRPC Proc   ──► prisma.user.findUnique()

Problems:
• No consistent auth checks
• Schema change breaks 50+ files
• Can't audit who accesses what
• Can't add logging/rate limiting centrally
• Type safety breaks at boundaries
• Testing requires full integration setup
```

---

## NodeBase DAL Implementation

```
src/
├── trpc/
│   ├── init.ts              ← protectedProcedure (auth middleware)
│   ├── routers/
│   │   ├── _app.ts          ← Root router
│   │   ├── user.ts          ← User data access
│   │   ├── workflow.ts      ← Workflow data access
│   │   ├── node.ts          ← Node data access
│   │   └── execution.ts     ← Execution data access
├── lib/
│   ├── db.ts                ← Prisma client (singleton)
│   ├── auth.ts              ← BetterAuth (auth data)
│   └── auth-utils.ts        ← Server-side auth helpers
```

---

## The Golden Rule

> **All database access goes through the DAL. No exceptions.**

If you catch yourself writing `prisma.` in a component, API route, or server action — **move it to a tRPC procedure**.

---

## Summary

| Question | Answer |
|----------|--------|
| **What is it?** | Single abstraction layer between app code and database |
| **Why important?** | Centralizes auth, enables type safety, allows centralized changes, enables testing |
| **Why implement?** | Without it: auth scattered, changes break everything, no audit trail, no central rate limiting, testing impossible |
| **In NodeBase** | tRPC procedures + protectedProcedure middleware + Prisma client = the DAL |

---

*This is why the lecture emphasizes: "The data access layer is the only security layer that matters."*

*Documented as part of the build → learn → discuss → document approach.*