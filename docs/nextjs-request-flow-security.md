# Next.js 16 Request Flow & Security Architecture

## Overview

This document describes the corrected mental model for Next.js 16 request handling, the Proxy layer, runtime configuration, and the security architecture for the NodeBase project.

---

## 1. Two-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      YOUR NEXT.JS APPLICATION                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  REQUEST INTERCEPTION LAYER (Proxy)                       │  │
│  │  File: proxy.ts                                           │  │
│  │  Role: Inspect request → Continue / Redirect / Rewrite   │  │
│  │  Runtime: Configurable ('nodejs' | 'edge')               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  APPLICATION LAYER                                        │  │
│  │  Files: app/, trpc/, lib/, actions/, API routes          │  │
│  │  Role: Render, execute logic, query database, auth       │  │
│  │  Runtime: Configurable per route                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Request Flow (Step by Step)

```
HTTP REQUEST arrives
         │
         ▼
┌──────────────────────────────────────────┐
│  PROXY LAYER (proxy.ts)                  │
│  • Runs FIRST on every request           │
│  • Can inspect: cookies, headers, URL    │
│  • Can: continue, redirect, rewrite      │
│  • Runtime: 'nodejs' OR 'edge' (config)  │
└──────────────────┬───────────────────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
      continue            redirect/rewrite
         │                   │
         ▼                   ▼
┌──────────────────┐  Response sent
│  APP LAYER       │  (never reaches
│  • Server Comp   │   your app)
│  • API Routes    │
│  • tRPC          │
│  • Server Actions│
│  • Database      │
└──────────────────┘
```

---

## 3. Two Runtimes (Configurable, Not Fixed)

| Runtime | APIs Available | Use Case |
|---------|----------------|----------|
| **`'nodejs'`** | Full Node.js (Prisma, fs, crypto, etc.) | Need DB, auth, business logic |
| **`'edge'`** | Web Standards only (fetch, crypto, URL) | Ultra-fast redirects, geo, headers |

```typescript
// proxy.ts — YOU CHOOSE
export const config = {
  runtime: 'nodejs',  // or 'edge'
};

export default async function proxy(request: NextRequest) {
  // Your interception logic
}
```

**Next.js 15.5+**: Node.js runtime for Proxy is **stable**.

---

## 4. Deployment Is Separate from Architecture

```
Your Code (proxy.ts, app/, trpc/, etc.)
         │
         ▼
┌─────────────────────────────────────────┐
│  DEPLOYMENT PLATFORM DECIDES:           │
│  • Vercel → Serverless + Edge functions │
│  • Netlify → Edge + Functions           │
│  • AWS Lambda → Serverless              │
│  • Docker → Container                   │
│  • Self-hosted → Your servers           │
└─────────────────────────────────────────┘
```

**Your code doesn't dictate "one server in Virginia"** — the platform does.

---

## 5. Security Model (Critical)

```
┌────────────────────────────────────────────────────────────────┐
│                    WHERE AUTH HAPPENS                          │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  PROXY LAYER (proxy.ts)          APP LAYER (tRPC, Server)     │
│  ─────────────────────────       ──────────────────────────   │
│  ✅ UX Redirects                   ✅ REAL SECURITY           │
│  ✅ Cookie existence check         ✅ Session validation (DB)  │
│  ✅ Geo blocking                   ✅ Permission checks        │
│  ✅ Bot detection                  ✅ Business logic           │
│  ✅ Header manipulation            ✅ Data access control      │
│                                                                │
│  ❌ NO database                    ✅ Full database access     │
│  ❌ NO session validation          ✅ Prisma, auth, etc.       │
│  ❌ NO permission checks           ✅ Real auth decisions      │
│  ❌ Can be bypassed                ✅ Cannot be bypassed       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 6. Auth Implementation in NodeBase

### Proxy Layer (UX Only)
```typescript
// proxy.ts — UX ONLY (redirects for better experience)
export default async function proxy(request: NextRequest) {
  const hasSessionCookie = request.cookies.has('session');
  
  if (!hasSessionCookie && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // Cookie exists? Let through — DON'T validate here
  return NextResponse.next();
}
```

### Server Components (Server-Side Protection)
```typescript
// app/dashboard/page.tsx
import { requireAuth } from '@/lib/auth-utils';

export default async function Dashboard() {
  const session = await requireAuth();  // ← REAL SECURITY (hits DB)
  return <DashboardContent user={session.user} />;
}
```

### tRPC Protected Procedures (Data Access Layer)
```typescript
// trpc/init.ts — DATA ACCESS LAYER (real security)
export const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, session: ctx.session } });
});
```

---

## 7. Key Vocabulary

| Term | Meaning |
|------|---------|
| **Proxy** | Request interception layer in Next.js 16+ (was `middleware.ts`) |
| **Intercept** | Catch/process request before normal handling |
| **Runtime** | Execution environment (`'nodejs'` or `'edge'`) |
| **Continue** | Let request proceed to app layer |
| **Redirect** | Send browser to different URL |
| **Rewrite** | Change URL internally (browser sees original) |
| **Deployment** | Putting code on infrastructure (Vercel, AWS, etc.) |
| **Topology** | Physical arrangement of components |

---

## 8. The Mental Model

> **Proxy = Request Interception Layer (UX)**  
> **App Layer = Where Real Work Happens (Security, DB, Logic)**  
> **Runtime = Configurable per layer (`'nodejs'` or `'edge'`)**  
> **Deployment = Platform's problem, not your code's**

---

## 9. NodeBase Project Structure

```
nodebase/
├── proxy.ts              ← Request interception (UX redirects)
├── app/
│   ├── (auth)/login/     ← Auth pages
│   ├── api/auth/...      ← BetterAuth handler
│   ├── api/trpc/...      ← tRPC endpoint
│   └── page.tsx          ← Protected page (requireAuth)
├── trpc/
│   ├── init.ts           ← protectedProcedure middleware
│   └── routers/_app.ts   ← Protected procedures HERE
├── lib/
│   ├── auth.ts           ← BetterAuth config
│   ├── auth-utils.ts     ← requireAuth(), requireUnauth()
│   └── db.ts             ← Prisma client
└── lib/auth-client.ts    ← Client-side auth
```

**Security Layer**: `protectedProcedure` in tRPC + `requireAuth()` in Server Components  
**UX Layer**: `proxy.ts` redirects + `requireUnauth()` on login page

---

## 10. Key Principles

1. **Proxy ≠ Security** — It's for UX redirects only
2. **Security = Data Access Layer** — tRPC protectedProcedure + Server Components with requireAuth()
3. **Runtime is a Choice** — Not a fixed property
4. **Deployment is External** — Your code doesn't dictate topology
5. **Cookie Check ≠ Session Validation** — Proxy sees cookie; App validates session

---

*Documented as part of the build → learn → discuss → document approach.*