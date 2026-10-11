# Error Tracing & Observability

**Lecture:** 08 — Production-Grade Error Tracking  
**Date:** 2026-10-10  
**Status:** Planning phase (pre-installation)

---

## 1. What Is Error Tracing?

Error tracing captures the **full causal chain** of an error — from user action → network request → server execution → external calls → response.

| Layer | Captured |
|-------|----------|
| Frontend | Clicks, component tree, React state, console, network, **session replay** |
| Network | Method, URL, headers, status, latency, payloads |
| Backend (tRPC) | Procedure, input, middleware, DB queries, external calls, stack trace |
| Background (Inngest) | Event payload, step execution, retries, sleeps |
| AI Calls | Model, prompt, tokens (in/out), latency, cost, tool calls, success/failure |

**Key distinction from logging:** Logs = discrete events. Traces = correlated spans with parent/child relationships — you see the *causal chain*.

---

## 2. Why NodeBase Needs It

### Development Phase
- Catch bugs you miss (users test edge cases you don't)
- Reproduce flaky bugs via session replay
- AI observability: 3+ models (GPT-4, Gemini, Claude) — no visibility without tracing

### Production Phase
| Problem | Without Tracing | With Sentry |
|---------|----------------|-------------|
| "It's broken" | Guesswork, screenshots | Session replay + full trace + breadcrumbs |
| AI costs spike | Bill arrives, no attribution | Per-model token/cost/latency dashboard |
| Background job fails | Manual log correlation | End-to-end: UI → tRPC → Inngest → AI → DB |
| Regression | Users complain | Alert on new error spike, shows release correlation |

### NodeBase-Specific
- **Workflow automation = complex chains** — One silent break = failed workflow
- **Multi-model AI** — Optimize cost/performance only with measurement
- **B2B (Clerk orgs planned)** — Errors need org/user context for support

---

## 3. Observability: The Concept

**Definition:** Ability to understand internal state *solely from external outputs*.

### Three Pillars (+ Sentry's Extensions)

| Pillar | Question | NodeBase Example |
|--------|----------|------------------|
| **Logs** | What happened? | "User clicked test AI", "generateText returned 429" |
| **Metrics** | How much/how often? | AI calls/min, avg latency, error rate, token cost/day |
| **Traces** | Where and why? | UI click → tRPC → Inngest → Gemini → DB write |

**Sentry adds (Level 5 maturity):**
- Session Replay (DOM reconstruction)
- AI Monitoring (Vercel AI SDK native)
- Profiling, Release tracking, Code owners
- Unified UI: logs + metrics + traces + replay + AI in one view

### Golden Signals (Google SRE)
| Signal | NodeBase Target |
|--------|-----------------|
| Latency | p50/p95/p99 per tRPC procedure, per AI model |
| Traffic | Requests/sec, AI calls/sec, Inngest events/sec |
| Errors | Error rate by procedure, by model, by org |
| Saturation | DB pool, Inngest queue, API rate limits |

---

## 4. Session Replay

### What It Is
Video-like reconstruction using **rrweb** — records DOM mutations, interactions, console, network. Not actual video (lightweight, searchable).

### Technical Capture
1. `MutationObserver` → every DOM change
2. Event listeners → click, input, scroll, focus, submit
3. Console interception → breadcrumbs
4. Network monitoring → fetch/XHR timing, payloads
5. Compressed JSON batches sent periodically
6. **Privacy by default**: mask all text, block media, configurable unmasking

### What You See
- Timeline scrubber
- Exact DOM snapshot at any timestamp
- Event breadcrumbs: "Click button#test-ai", "POST /api/trpc/textAi 500"
- Console logs + network waterfall
- Error overlay pinned to crash moment

### NodeBase Use Cases
| Scenario | Value |
|----------|-------|
| "Workflow didn't run" | See exact canvas clicks, node connections, form inputs |
| AI output wrong | See user prompt + model response |
| ReactFlow race condition | Drag-drop sequence visible |
| Form validation | See actual keystrokes, focus order |

### Config (Wizard Defaults)
```typescript
// sentry.client.config.ts
replaysOnErrorSampleRate: 1.0,    // 100% of error sessions
replaysSessionSampleRate: 0.1,    // 10% of all sessions
replayOptions: {
  maskAllText: true,
  blockAllMedia: true,
  // unblock: '.workflow-canvas, .node-config-panel',
}
```

### Compliance
- GDPR/CCPA ready (no PII by default)
- Self-hosted option available
- User opt-out: `Sentry.setTrackingConsent(false)`

---

## 5. Logs (Structured, Correlated)

### Difference from Traditional Logging

| Traditional | Sentry Logs |
|-------------|-------------|
| `console.log("user", user)` | Structured JSON with `trace_id`, `span_id`, user, release |
| Separate system (ELK) | Same UI as errors, traces, replays |
| Manual correlation | Auto-linked via `trace_id` |
| No context | Auto-enriched: user, release, env, request |

### Integration

**Frontend (auto):**
```typescript
// sentry.client.config.ts
integrations: [
  Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
]
```

**Backend (Node/Edge):**
```typescript
// sentry.server.config.ts, sentry.edge.config.ts
integrations: [
  Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
]
```

**Structured (recommended):**
```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.logger.info("workflow.executed", {
  workflowId,
  nodeCount: nodes.length,
  durationMs: Date.now() - start,
}, { tags: { feature: "workflow-engine" } });
```

### LogQL Query Examples
```sql
-- Errors in textAi mutation last 24h
level:error AND transaction:"textAi" AND timestamp:>24h

-- Slow AI calls (>5s) for Gemini
level:info AND message:"generateText" AND duration:>5000 AND model:"gemini*"

-- User-specific debugging
user.id:"usr_123" AND level:error
```

### NodeBase Logging Strategy
| Layer | What to Log | Level |
|-------|-------------|-------|
| tRPC procedures | Input, auth, DB query, external call | info |
| Inngest steps | Step start/end, payload, retries | info/warn |
| AI calls | Model, prompt hash, tokens, latency, cost, errors | info/error |
| React components | User actions (save, run, deploy) | info |
| Errors | **Never log manually** — Sentry captures auto | — |

---

## 6. AI Monitoring (Vercel AI SDK Integration)

### What It Is
First-class observability for LLM calls — auto-instruments `generateText`, `streamText`, `generateObject`, tool calls. Surfaces: cost, latency, tokens, errors, model routing.

### Setup
```typescript
// sentry.server.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // The installed Sentry SDK is v10; add the Vercel AI integration explicitly.
  integrations: [Sentry.vercelAIIntegration()],
  tracesSampleRate: 1.0,  // Required
});
```

### Code Change (Add Telemetry)
```typescript
// Assign the same opaque ID to every AI call in a conversation.
Sentry.setConversationId(conversationId);
const { text } = await generateText({
  model: google("gemini-3.5-flash"),
  prompt: "Write a recipe...",
  experimental_telemetry: {
    isEnabled: true,
    recordInputs: true,
    recordOutputs: true,
    functionId: "text-ai-recipe",
  },
});
```

The client creates one UUID per mounted chat session and passes it with the tRPC
request. Keep prompts and outputs enabled to populate Conversations; disable or
scrub them if they may contain sensitive data. This project uses the AI SDK v7
`experimental_telemetry` option.

### Sentry AI Dashboard Views

| View | Metrics |
|------|---------|
| **Traces** | Per-call timeline: prompt → model → response → tools → output |
| **Models** | Model \| calls \| in tokens \| out tokens \| total $ \| avg latency \| error % |
| **Tools** | Tool name \| calls \| avg latency \| error rate \| schemas |
| **Errors** | Full trace + prompt + response + stack trace |

### Example Insight
```
MODELS (Last 24h)
┌──────────────────┬───────┬───────────┬────────────┬──────────┬──────────┬──────────┐
│ Model            │ Calls │ In Tokens │ Out Tokens │ Total $  │ Avg Lat  │ Error %  │
├──────────────────┼───────┼───────────┼────────────┼──────────┼──────────┼──────────┤
│ gpt-4o           │ 1,247 │ 2.4M      │ 890K       │ $18.47   │ 2.3s     │ 1.2%     │
│ gemini-1.5-flash │ 3,891 │ 1.1M      │ 440K       │ $0.89    │ 0.8s     │ 0.1%     │
│ claude-3.5-sonnet│ 567   │ 1.8M      │ 620K       │ $12.34   │ 3.1s     │ 2.8%     │
└──────────────────┴───────┴───────────┴────────────┴──────────┴──────────┴──────────┘
→ Decision: Default users to Gemini, offer GPT-4/Claude as premium
```

### Tool Call Tracing (Agentic Workflows)
```typescript
const { text } = await generateText({
  model: openai("gpt-4o"),
  tools: { searchWeb: {...}, queryDatabase: {...}, sendEmail: {...} },
  experimental_telemetry: { isEnabled: true, functionId: "research-agent" },
});
```
- Each tool = span with input, output, latency, success/failure
- See *which tool* failed, *what args* caused it
- Correlate with replay: user asked "email results" → `sendEmail` failed

### Cost Formula (Auto-Calculated)
```
Cost = (input_tokens × input_price_per_1k) + (output_tokens × output_price_per_1k)
```
Override pricing for fine-tuned models if needed.

### NodeBase AI Monitoring Checklist
- [x] Add `Sentry.vercelAIIntegration()` to the server config
- [x] Add `experimental_telemetry` and a conversation ID to the `generateText` call
- [ ] Use descriptive `functionId` per feature (`workflow-node-execute`, `chat-completion`, `email-draft`)
- [ ] `tracesSampleRate: 1.0` in dev, `0.1–0.5` in prod
- [ ] Monitor: cost/day, error rate by model, p95 latency, tool failures

---

## 7. How They Work Together (End-to-End)

```
USER CLICKS "Run Workflow"
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│ SESSION REPLAY: canvas clicks, node config, "Run" click     │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│ tRPC MUTATION (executeWorkflow)                              │
│ LOGS: "workflow.execute started", { workflowId, nodeCount } │
│ TRACE: span starts                                           │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│ INNGEST FUNCTION (processWorkflow)                           │
│ LOGS: "step.run: executeNode", { nodeId, type: "ai" }       │
│ TRACE: child spans per step                                  │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│ AI CALL (generateText + telemetry)                           │
│ AI MONITORING: prompt, model, tokens, latency, cost, tools  │
│ TRACE: span with AI attributes                               │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│ ERROR: Model returns 429 (rate limited)                      │
│                                                               │
│ IN SENTRY YOU SEE:                                           │
│ 1. Session replay → user's exact actions                     │
│ 2. Trace → full call chain with timings                      │
│ 3. Logs → "retrying... attempt 2" at each step               │
│ 4. AI Monitoring → model=gpt-4, tokens=4500, cost=$0.12     │
│ 5. Error → 429 with retry-after header                       │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. Implementation Plan for NodeBase

### Phase 1: Install Sentry (Wizard)
```bash
npx @sentry/wizard@latest -i nextjs
```
- Sentry SaaS, existing account, create "NodeBase" project
- Enable: Tracing, Session Replay, Logs, Example page
- Accept TurboPack warning (Next.js 16 ≥ 15.3.0)
- Adds `SENTRY_AUTH_TOKEN` to `.env`

### Phase 2: Configure Integrations
**Files created by wizard:**
- `sentry.client.config.ts` — Browser SDK
- `sentry.server.config.ts` — Node.js runtime
- `sentry.edge.config.ts` — Edge runtime
- `instrumentation.ts` — Auto-instrumentation entry point

**Add to the server config for Vercel AI SDK calls:**
```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  tracesSampleRate: 1.0,
  integrations: [Sentry.vercelAIIntegration()],
});
```

**Client config:**
```typescript
Sentry.init({
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
    Sentry.replayIntegration(),
  ],
});
```

### Phase 3: Instrument AI Calls
**Current locations needing telemetry:**
- `src/trpc/routers/_app.ts` → `textAi` mutation (generateText)
- Future: Inngest functions using AI

```typescript
const { text } = await generateText({
  model: google("gemini-3.5-flash"),
  prompt: "Write a vegetarian lasagna recipe for 4 people.",
  maxRetries: 0,
  experimental_telemetry: {
    isEnabled: true,
    recordInputs: true,
    recordOutputs: true,
    functionId: "text-ai-recipe",
  },
});
```

Set `Sentry.setConversationId()` with the same opaque session ID before each AI
call to group requests into a Sentry Conversation.

### Phase 4: Verify
- `npm run dev`
- Visit `/sentry-example-page` → click "Test Error" → verify in Sentry
- Click "test ai" button → verify AI Monitoring dashboard

---

## 9. Current State vs. Target

| Feature | Current | Target |
|---------|---------|--------|
| Sentry SDK | ✅ `@sentry/nextjs` installed and initialized | Keep SDK current |
| DSN | ✅ Configured in Sentry client/server/edge configs | Use project environment variables if desired |
| Client/Server/Edge config | ✅ Present | Keep runtime configs aligned |
| Vercel AI SDK integration | ✅ `Sentry.vercelAIIntegration()` on server | Add if other AI runtimes are introduced |
| `experimental_telemetry` on AI calls | ✅ Enabled for `textAi` with conversation ID | Instrument future AI calls |
| Session replay | ✅ Configured in client SDK | Tune sampling for production |
| AI monitoring dashboard | Not verified from this workspace | Verify agent spans and conversations in Sentry |

---

## 10. Cost Estimate

| Approach | Monthly (10K users) | Engineering Effort |
|----------|---------------------|-------------------|
| DIY (ELK + Jaeger + Prometheus + Grafana) | $500–2000 + eng time | High |
| Datadog / New Relic | $3000–15000 | Medium |
| **Sentry Team (3mo free)** | **$0 → ~$260** | **Low (wizard)** |

---

## 11. Key Takeaways

1. **Don't just "add Sentry"** — Understand what each config option instruments
2. **Correlate, don't silo** — Power is linking: replay → trace → AI call → DB query
3. **Instrument at boundaries** — tRPC procedures, Inngest functions, AI calls, DB transactions
4. **Own your signals** — Define SLIs/SLOs (e.g., "99% of textAi < 2s, error rate < 0.1%")
5. **AI monitoring is a force multiplier** — Cost optimization, model routing, debugging agentic flows

---

## 12. Next Steps

1. Run Sentry wizard (`npx @sentry/wizard@latest -i nextjs`)
2. Add AI + logging integrations to server/edge configs
3. Add `experimental_telemetry` to `textAi` mutation
4. Test error + AI flow in dashboard
5. Document any NodeBase-specific config decisions

---

*This document will be updated as implementation progresses.*