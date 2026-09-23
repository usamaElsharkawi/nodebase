# Trigger Nodes and Execution Nodes

## Overview

Every workflow in NodeBase is a chain of nodes. Nodes fall into two categories: **Trigger Nodes** and **Execution Nodes**. Understanding this distinction is the foundation of the entire platform.

---

## Trigger Nodes — "When?"

Trigger nodes are **event listeners**. They sit idle until something external happens, then they wake up and start the workflow.

### What makes a trigger special?

1. **It has NO input data** — it starts the chain. There is nothing before it.
2. **It EMITS data** — when triggered, it passes data to the next node. For example, a Google Form trigger emits the form responses as JSON.
3. **It's always "on"** — even when no workflow is running, it's waiting (like a background service).

### Types of Triggers in NodeBase

| Trigger | How it listens | Real-world analogy |
|---|---|---|
| **Google Form** | Listens for form submissions via Google API | A mailbox — waits for letters to arrive |
| **Webhook** | Listens for HTTP POST requests to a unique URL | A doorbell — rings when someone presses it |
| **Stripe Event** | Listens for Stripe events (payment success, subscription created) | A cash register — rings when a sale happens |
| **Manual** | User clicks "Run" in the UI | A light switch — you flip it manually |

### In code terms

```
Trigger Node = an API route that receives external data
         ↓
   passes that data to the execution engine
         ↓
   starts the chain of execution nodes
```

---

## Execution Nodes — "What?"

Execution nodes **do something** with data. They always receive data from a previous node, process it, and pass results forward.

### What makes an execution special?

1. **It ALWAYS has input** — it receives data from the node before it.
2. **It ALWAYS has output** — it passes results to the node after it.
3. **It has a configuration panel** — where you set API keys, prompts, channel IDs, etc.
4. **It has a status** — pending → running → success/failed (the visual states shown on the canvas).

### Types of Executions in NodeBase

| Execution | What it does with input data | Real-world analogy |
|---|---|---|
| **OpenAI** | Takes text → returns AI analysis/summary | A translator — takes one language, outputs another |
| **Gemini** | Same as OpenAI but different model | Another translator — same job, different style |
| **Cloud** | Cloud-based AI processing | An outsourced team — same work, different provider |
| **Discord** | Takes a message → posts it to a channel | A messenger — delivers your message somewhere |
| **Slack** | Takes a message → posts it to a channel | Another messenger |
| **HTTP Request** | Takes data → sends it to any URL | A postal service — delivers your package anywhere |

### In code terms

```
Execution Node = a component with:
  - input data (from previous node)
  - config (user settings in the panel)
  - logic (the actual API call / processing)
  - output data (passed to next node)
  - status (pending/running/success/failed)
```

---

## How They Work Together

```
[Google Form Trigger]
        ↓ (emits form data)
[OpenAI Execution]
        ↓ (receives form data, emits AI summary)
[Discord Execution]    [Slack Execution]
  (receives summary)    (receives summary)
        ↓                     ↓
   posts to Discord       posts to Slack
```

---

## The Key Insight

> **Triggers = "When?"** → When does this workflow start?
> **Executions = "What?"** → What should happen with the data?

Every integration you add is just one of two things:
- A new **trigger** (a new way to start a workflow)
- A new **execution** (a new thing to do with data)

That's why the architecture is extensible — Airtable would be an execution (receive data → create a record), Notion would be an execution (receive data → create a page), SendGrid would be an execution (receive data → send an email).

---

## Node Status Lifecycle

Every execution node has a lifecycle that the UI shows via ReactFlow:

```
⏳ pending    →  waiting to run
🔄 running    →  currently executing (WebSocket updates power this)
✅ success    →  completed successfully (green)
❌ failed     →  errored (red, with error message)
```

---

## Next Steps

- [ ] Build trigger node architecture
- [ ] Build execution node architecture
- [ ] Implement node configuration panels
- [ ] Connect nodes with data mapping (template syntax)
- [ ] Add real-time status updates via WebSockets

---

*Documented as part of the build → learn → discuss → document approach.*
