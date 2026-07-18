# openai-imessage

Bouncer-style iMessage orchestrator: inbound messages are debounced, an Interaction Agent may `assign_task` to an Execution Agent, and when the worker finishes it **notifies** the orchestrator, which `space.send`s the reply to the person.

Conversation history and Hermes-style curated memory (`USER.md` / `MEMORY.md`) persist in **Convex**.

## Stack

- **Bun** + Spectrum iMessage (`@spectrum-ts/core`, `@spectrum-ts/imessage`)
- **Vercel AI SDK** (`ai`, `@ai-sdk/openai`)
- **GMI Cloud** OpenAI-compatible inference (`GMI_CLOUD_API_KEY`)
- **Convex** — durable messages + curated memory (`CONVEX_URL`)
- **Composio** — per-person OAuth connections for Gmail, Google Calendar, and other approved apps

## Setup

```bash
bun install
```

### Convex (memory + conversation)

```bash
# Terminal A — links a deployment, pushes schema/functions, writes CONVEX_URL
bun run convex:dev
```

In another terminal (or after `convex:dev` has printed the URL), add to `.env` (do not commit secrets):

```bash
CONVEX_URL=https://….convex.cloud
ORCHESTRATOR_BRIDGE_SECRET=some-long-random-string
```

Set the same bridge secret on the Convex deployment:

```bash
bunx convex env set ORCHESTRATOR_BRIDGE_SECRET some-long-random-string
```

Keep `bun run convex:dev` running while developing so functions stay synced.

### App env

```bash
GMI_CLOUD_API_KEY=
# optional override; default moonshotai/kimi-k2.7-code-highspeed
# GMI_MODEL=

SPECTRUM_PROJECT_ID=
SPECTRUM_PROJECT_SECRET=
SPECTRUM_SIGNING_WEBHOOK=

CONVEX_URL=
ORCHESTRATOR_BRIDGE_SECRET=

# optional
# ORCHESTRATOR_DEBOUNCE_MS=1500
# AGENT_PORT=4001
# BASE_URL=https://agent.alhwyn.com

# optional Composio connected-app tools. Leave COMPOSIO_API_KEY unset to run
# without external-app access.
# COMPOSIO_API_KEY=
# Use a long random secret; it hashes iMessage sender IDs before they reach Composio.
# COMPOSIO_USER_ID_SALT=
# Comma-separated approved toolkit slugs. Defaults to gmail,googlecalendar.
# COMPOSIO_TOOLKITS=gmail,googlecalendar
```

## Run

```bash
# Terminal 1 — Convex
bun run convex:dev

# Terminal 2 — orchestrator
bun run start
```

### Dev tunnel (optional, like ngrok)

Expose localhost to a stable HTTPS hostname for webhook testing (same Cloudflare tunnel as bouncer):

```bash
# Terminal 1 — app on :4001
AGENT_PORT=4001 bun run start

# Terminal 2 — one-off random URL
bun run tunnel:quick

# Or named tunnel (first time)
bun run tunnel:setup
bun run tunnel
```

Defaults: tunnel `webhook-automator` → `agent.alhwyn.com` → `127.0.0.1:4001`.

Set `BASE_URL=https://agent.alhwyn.com` in `.env` when testing webhooks.

## How orchestration works

Layout lives under `src/orchestrator/` (types / utils / agents / bounce / handoff / **db** / **memory** / prompts):

1. Person texts → keyed debounce (`src/orchestrator/bounce/inbound.ts`)
2. Interaction Agent loads curated memory, recent conversation history, and optional connected-app tools, then runs with first-party tools such as `assign_task`, `assign_image_task`, `react_to_message`, and `memory`
3. Worker runs stubs (`echo`, `search_mock`) in `src/orchestrator/agents/execution.ts`
4. Handoff delivers worker output to the captured conversation target
5. Turn transcripts append atomically in Convex; memory edits use their own mutation

`db/` is the only module that talks to Convex; `memory/` calls `db` functions.

### Composio connected apps

The agent caches one Composio Tool Router tool set per sender and toolkit configuration.
Connections are isolated by sender: the raw Spectrum sender ID is salted and hashed
before it becomes the Composio user ID. If Spectrum does not provide a sender ID,
connected-app tools stay disabled for that message. By default, only Gmail and Google Calendar
are enabled. Add explicitly approved toolkit slugs to `COMPOSIO_TOOLKITS` to enable
other apps.

When someone asks to use an unconnected service, the agent uses Composio's
connection manager and texts back the OAuth URL. The person completes OAuth in
their browser, then sends their request again. No passwords or OAuth codes are
stored or requested in iMessage.

To set up the Composio project, install and log in to the CLI, then initialize it
from this project and add the API key it creates to `.env`:

```bash
composio login
composio init
```

### Smoke test

1. Text: “search for weekend plans and tell me” — expect ack → sub-agent → mock search reply.
2. Text: “call me Al from now on” — agent should `memory` add to user; restart the app; text again and confirm it still knows the name.
3. Multi-turn chat should survive process restart (history in Convex).
