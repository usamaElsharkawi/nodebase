# Background Jobs — Architecture & Implementation

## Overview

A background job is work that is **persisted at request time** and **executed later by a separate process**. The request's only job is to make the work *durable* — everything after that is a state machine you can pause, resume, and retry one step at a time. In NodeBase, background jobs are implemented with **Inngest** (durable functions + per-step retry) triggered from **tRPC mutations**.

This document captures why we need them, how the lifecycle works, and where they fit in our architecture.

---

## 1. The Problem

Synchronous request contract: **the client waits, the server works, the connection must survive.**

Example — AI summary of a 12-hour video, three external services in sequence:

```
fetch video (5s) → transcribe (5s) → send to AI (5s) = 15s of waiting
```

| Failure | Synchronous Result |
|---------|---------------------|
| Any step times out | Whole request fails, user gets nothing |
| Connection lost mid-way | Work already done is lost |
| User closes the tab | Job dies with the connection |
| Step 3 fails | Steps 1 and 2 must be repeated (and re-paid) |

---

## 2. What Is a Background Job?

A unit of work that is **persisted at request time** and **executed later by a separate process**, so the original request returns immediately instead of waiting.

```
┌───────────────────────────────────────────────────────────────┐
│                        SYNCHRONOUS                              │
│  Client ──► Server works 15s ──► Client gets result            │
│  (client waits, connection must survive, failure = total loss)  │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│                        BACKGROUND JOB                           │
│  Client ──► Server RECORDS job ──► instant "queued" response   │
│  Client is free (can close tab)                                 │
│  Worker executes later, step by step, retryable per step        │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. The Four Components

| Component | Role |
|-----------|------|
| **Producer** | Code in the request handler that creates the job and hands it to the job system. Performs **no real work**. |
| **Event log / queue** | Durable storage where the job definition and payload are written. The source of truth. |
| **Worker** | Independent process that reads from the log and executes the job. Has **no access** to the original request, session, or connection. |
| **Function** | The job's logic, defined as a series of discrete **steps**. |

---

## 4. The Full Lifecycle

```
T0   User clicks "Create Workflow"
T1   Browser → your server          (request/response, tRPC mutation)
T2   Your server → Inngest API      (request/response, ingest.send)
T3   Inngest writes event to store  ← the durability guarantee
T4   Server → browser: { success }  toast: "Job queued", button re-enables
T5   User closes the tab            ← nothing breaks
T6   Inngest worker → /api/ingest   (server-to-server push/callback)
T7   Function runs; step 1 executes; input/output checkpointed
T8   Step 2 fails → retry with backoff; function re-runs from top,
     completed steps skipped by replaying stored outputs
T9   Function returns → run marked complete
T10  Inngest → browser (push) → UI shows running/completed/failed live
```

**Key Insight**: at T2 *you* call Inngest; at T6 *Inngest calls you*. Same request/response pattern, opposite direction.

---

## 5. Communication Patterns Used

Background jobs are **not a new transport** — they are an orchestration layer built on patterns we already studied:

| Hop | Pattern | Direction |
|-----|---------|-----------|
| Click → tRPC mutation | Request/response | Browser → server |
| `ingest.send()` → Inngest API | Request/response | Server → Inngest |
| Inngest → `/api/ingest` route | **Reversed** push (webhook/callback) | Inngest → server |
| Inngest → browser (real-time, later) | Push (SSE/WebSocket) | Inngest → browser |

The durability itself (paused steps, retries, sleeps) is **persisted state, not a protocol**. No socket is held open during execution.

---

## 6. Properties

| Property | Meaning |
|----------|---------|
| **Asynchronous** | Execution is decoupled from the request/response cycle |
| **Durable** | Job survives restarts, dropped connections, closed tabs — state is persisted, not in memory |
| **Decoupled** | Worker is a stranger to the request: no session, no cookies, no user context |
| **Resumable** | Function re-executes from the top on retry; completed steps are skipped by replaying stored outputs |
| **Observable** | Every run and step is inspectable: running / completed / failed + error details |
| **Idempotency-dependent** | Steps can re-run, so any step with an external side effect must be safe to execute more than once |

---

## 7. What Survives What

| Failure | Result |
|---------|--------|
| Tab closed at T5 | Job still runs |
| Your server restarts | Job still runs |
| Step 2 fails | Only step 2 re-runs |
| Inngest down at T2 | `send` errors, user sees failure, nothing queued (safe) |
| `/api/ingest` unreachable at T6 | Job stays queued, Inngest retries later |

---

## 8. Hidden Costs

| Cost | Explanation |
|------|-------------|
| **Two HTTP round trips before any work starts** | The price of durability |
| **Function re-runs from the top on every retry** | Steps with side effects (email, paid API, DB insert) must be idempotent or retries create duplicates |
| **No user context in the worker** | `userId`, `workflowId`, URLs, node ids must be passed explicitly in the event payload — the most common bug in this architecture is the job silently doing the wrong user's work |
| **Event name is a contract** | The name in `createFunction()` and in `send()` must match character for character; a typo fails at dispatch time in the dashboard, not loudly in code |
| **Two dev processes** | `npm run dev` + `npx ingest-cli dev` (or mprox) must both run, or jobs queue but never execute |

---

## 9. Key Vocabulary

| Term | Meaning |
|------|---------|
| **Producer** | Request-side code that enqueues the job |
| **Event** | The persisted message: name + JSON payload |
| **Function** | The job's logic, registered with an id and an event name |
| **Step** | A discrete, checkpointed unit of work inside a function |
| **Checkpoint** | Stored input/output of a completed step, used for replay |
| **Backoff** | Exponentially increasing delay between retries |
| **Webhook route** | The `serve()` endpoint Inngest calls to execute functions |
| **Run** | One execution of a function, with per-step status |

---

## 10. The Alternative (And Why It Fails)

```
WITHOUT BACKGROUND JOBS:
Component A ──► await fetchVideo(); await transcribe(); await summarize();
Component B ──► await fetchVideo(); await transcribe(); await summarize();
Server Action ──► await fetchVideo(); await transcribe(); await summarize();

Problems:
• User waits 15s with no feedback
• One timeout = total loss of all prior work
• Closed tab = lost job
• Failed step = repeat everything (and re-pay)
• No visibility into what failed or why
• No retry without user intervention
```

---

## 11. NodeBase-Specific Requirements

| Requirement | How Background Jobs Solve It |
|-------------|------------------------------|
| **Multi-step integrations** (YouTube → AI → Slack/Discord) | Each external call is a step, retried independently |
| **Paid external APIs** | Failed step doesn't waste already-completed steps |
| **User must keep working** | Instant "queued" response; user closes tab freely |
| **Real-time execution status** | Inngest real-time service pushes run status to the browser |
| **Multi-tenant safety** | `userId` travels in the event payload, not the session |
| **Observability** | Every run inspectable in the Inngest dashboard (localhost:8288 in dev) |

---

## 12. Inngest Setup in NodeBase

```
nodebase/
├── src/
│   ├── ingest/
│   │   ├── client.ts        ← single Ingest instance (name: "nodebase")
│   │   └── functions.ts     ← createFunction({ id, event }, handler)
│   ├── trpc/
│   │   └── routers/
│   │       └── _app.ts      ← mutation calls ingest.send("event/name", payload)
│   └── app/
│       └── api/
│           └── ingest/
│               └── route.ts ← serve({ client, functions }) — the webhook
├── inngest.yaml             ← (optional) dev config
└── mprox.yaml               ← (optional) runs ingest + next in one terminal
```

**Dev server**: `npx ingest-cli dev` → local instance on **localhost:8288** where every run is visible and functions can be invoked manually with a JSON payload.

**Dev tooling (optional)**: `mprox.yaml` runs `npm run ingest` and `npm run dev` together via `npm run dev:all`. Keys: `q` quit, `c` copy, `r` restart selected process. Ctrl+C does **not** quit.

**Retries**: configurable per function/step (e.g. `retries: 5`), with exponential backoff so rate-limited providers get breathing room.

---

## 13. What the Lecture Demo Faked (Do Not Cargo-Cult)

- `await sleep(5000)` standing in for real external I/O
- The `Workflow` row created **inside the job**, not at trigger time — so the UI shows nothing until the job finishes and requires a manual refresh
- The function trusting its payload blindly — no authorization against a real user
- No status field on the model, so "in progress" and "failed" are not representable in the UI

### Production version needs

1. A `status` enum on `Workflow` (draft / queued / running / completed / failed) plus a failure reason
2. The real `userId` and `nodeId` in the event payload
3. Idempotent steps before any retry config above zero
4. Real-time status pushed to the browser instead of refresh-to-see

---

## 14. The Mental Model

> **Request/response gets the job in the door.**  
> **Reversed push gets the job executed.**  
> **Push gets the result back to the user.**  
> **The job itself is just stored state.**

**The Golden Rule**:

> The request's only job is to make the work *durable*. If your mutation is doing the real work, it's not a background job — it's a slow request.

---

## 15. Decision Matrix

```
            ┌─────────────────────────────────────┐
            │  Does the user need the result to   │
            │  continue?                           │
            └──────────────────┬──────────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                   ▼
            No                                   Yes
              │                                   │
              ▼                                   ▼
   ┌─────────────────────┐            ┌─────────────────────┐
   │ BACKGROUND JOB      │            │ SYNCHRONOUS REQUEST │
   │ if it also calls    │            │ (fast, < a few      │
   │ 2+ external services│            │  seconds, one       │
   │ or takes > a few    │            │  call)              │
   │ seconds             │            └─────────────────────┘
   └─────────────────────┘
```

Before enabling retries, always ask: **is this step safe to run twice?**

---

## Next Steps

- [ ] Add `Workflow` model with status enum and userId relation
- [ ] Create `src/ingest/client.ts` and `src/ingest/functions.ts`
- [ ] Add `/api/ingest/route.ts` with `serve()`
- [ ] Trigger first function from a tRPC mutation
- [ ] Pass real `userId` in the event payload
- [ ] Replace demo sleeps with real step logic
- [ ] Add real-time status to the UI
- [ ] Decide on mprox vs running two terminals manually

---

*This is why the lecture emphasizes: "Because of that, we are implementing background jobs, which will simply notify the user when something is finished."*

*Documented as part of the build → learn → discuss → document approach.*
