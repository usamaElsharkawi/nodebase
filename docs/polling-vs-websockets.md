# Polling vs WebSockets — Tradeoffs

## Overview

Every communication pattern has a cost. In engineering, you choose what you're willing to lose in order to gain something else. This document documents the tradeoff analysis between polling and WebSockets for NodeBase.

---

## Polling

### How It Works

Client-driven pattern. The browser repeatedly asks the server for updates.

```
Time 0s:  Browser → "Any updates?"  → Server: "No"
Time 2s:  Browser → "Any updates?"  → Server: "No"
Time 4s:  Browser → "Any updates?"  → Server: "No"
Time 6s:  Browser → "Any updates?"  → Server: "Yes! Discord failed!"
Time 8s:  Browser → "Any updates?"  → Server: "No"
```

### What You Gain

- **Dead simple** — just an HTTP request on a timer. Every developer knows how to do it.
- **Stateless** — each request is independent. If one fails, the next one still works.
- **Easy to debug** — log every request, see every response.
- **Easy to scale** — just add more servers. No sticky sessions needed.
- **Universal** — works everywhere, no special setup.

### What You Pay

| Cost | Explanation |
|---|---|
| **Latency** | Updates arrive up to the poll interval late. Poll every 2s? Updates are up to 2s late. |
| **Wasted resources** | Most responses are "no change." Burning CPU, bandwidth, and database connections for nothing. |
| **Server load** | 100 users polling every 2s = 50 requests/second. Multiply by workflows with 10 nodes = 500 checks/second just for status. |
| **User experience** | Users see a lag between what happened and what they see. Not great for a real-time canvas. |

---

## WebSockets

### How It Works

Server-driven pattern. Once connected, the server pushes updates instantly.

```
1. Handshake: Browser → "Let's keep this connection open"
2. Server: "Sure, here's your WebSocket connection"
3. [Connection stays open permanently]
4. When something happens: Server → "Discord just failed!" (instantly)
5. When something happens: Server → "OpenAI just succeeded!" (instantly)
6. No wasted requests. No delays.
```

### WebSocket Lifecycle

```
CONNECT    →    OPEN    →    MESSAGES FLOWING    →    CLOSE
(handshake)   (ready)    (real-time updates)      (done/disconnected)
```

### What You Gain

- Real-time updates (milliseconds)
- Efficient (no wasted requests)
- Two-way communication (server → browser AND browser → server)
- Clean architecture for real-time features

### What You Pay

| Cost | Explanation |
|---|---|
| **Complexity** | Manage connections. Connections can drop. Need reconnection logic, heartbeat/keepalive pings, and error handling. |
| **Server memory** | Every connected user holds an open connection in memory. 100 users = 100 connections. 10,000 users = 10,000 connections. Each consumes RAM. |
| **Scaling difficulty** | Horizontal scaling requires a pub-sub layer (like Redis) so servers know what other servers' connections received. Otherwise, updates get lost. |
| **Authentication overhead** | WebSocket handshake must verify the user via token in connection URL. Token expiry mid-connection needs a refresh strategy. |
| **Debugging pain** | HTTP requests are easy to log and inspect. WebSockets are persistent — harder to trace when things break. |
| **Statefulness** | HTTP is stateless (each request independent). WebSockets are stateful (connection remembers everything). Stateful systems are harder to maintain and recover from failures. |

---

## The Core Tradeoff Matrix

```
                    SIMPLICITY ←————————→ REAL-TIME
                    (Polling)              (WebSocket)
                         |                    |
                    Easy to build        Hard to build
                    Easy to debug        Hard to debug
                    Easy to scale        Hard to scale
                    High latency         Low latency
                    Wasted resources     Efficient
                    Stale data           Fresh data
```

**You choose one end or the other — or a hybrid.**

---

## Hybrid Approach (The Pragmatic Choice)

In real engineering, you often mix both:

| Feature | Pattern | Why |
|---|---|---|
| **Canvas node status** | WebSocket | Needs real-time, users are watching live |
| **Workflow history** | Polling or HTTP | User opens a page, fetches once, no need for live updates |
| **User notifications** | WebSocket | Instant, can't afford delay |
| **Dashboard analytics** | Polling every 30s | Updates are infrequent, simplicity wins |
| **Health checks** | Polling every 60s | Rarely changes, simple is fine |

---

## What This Means for NodeBase

### Where WebSockets are worth the cost
- **Canvas node status updates** — users are actively watching a workflow run. They need instant feedback. This is the core feature. The complexity is justified.

### Where simpler is better
- **Loading workflow data** — fetch once when the page opens. No need for WebSocket.
- **Saving workflow configurations** — HTTP POST/PUT. Done.
- **Fetching user settings** — HTTP GET. Done.
- **Listing workflows** — HTTP GET. Done.

### The specific costs we'll pay
1. **Connection management** — handle:
   - User closes tab → cleanup
   - Network drops → reconnection
   - User opens 2 tabs → multiple connections
2. **Ingest handles the pub-sub layer** — key advantage. Ingest provides the message bus so that even if we scale to multiple servers, messages route correctly. This eliminates the hardest scaling problem.
3. **Reconnection logic** — when a connection drops, the browser reconnects and re-syncs state. Not trivial, but manageable.

### The honest truth
> We're choosing **complexity** (WebSocket) for the **core experience** (real-time canvas). We're choosing **simplicity** (HTTP) for everything else. This is the right tradeoff for a SaaS product where the real-time canvas is the main selling point.

---

## The Engineer's Decision Framework

Before choosing any pattern, always ask:

1. **How often does data change?** → Rare = polling, Frequent = WebSocket
2. **How critical is timing?** → "Whenever" = polling, "Now" = WebSocket
3. **How many users?** → Few = WebSocket OK, Many = think about scaling
4. **What's my team's experience?** → New team = start simple, grow into WebSocket
5. **What's the cost of being wrong?** → Stale data OK? = polling, Must be fresh = WebSocket

---

## Server-Sent Events (SSE) — The Middle Ground

Worth noting as a third option:

```
Polling:    Browser keeps asking     → wasteful
WebSocket:  Browser ↔ Server (two-way) → most powerful
SSE:        Server → Browser (one-way) → simpler than WebSocket
```

SSE is like a WebSocket but **only server-to-browser**. The browser can't send messages back through it (but can still make regular HTTP requests for that). Simpler than WebSockets, built on HTTP.

**When to use SSE vs WebSocket in NodeBase:**
- **SSE** — if only need status updates (server → browser), like showing node progress
- **WebSocket** — if need two-way communication, like "stop execution" commands from the browser

---

## Next Steps

- [ ] Implement WebSocket connection layer for canvas updates
- [ ] Implement reconnection logic
- [ ] Integrate Ingest pub-sub for multi-server support
- [ ] Handle authentication for WebSocket handshake
- [ ] Decide on SSE vs WebSocket for specific features

---

*Documented as part of the build → learn → discuss → document approach.*
