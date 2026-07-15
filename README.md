# openai-imessage

Bouncer-style iMessage orchestrator: inbound messages are debounced, an Interaction Agent may `assign_task` to an Execution Agent, and when the worker finishes it **notifies** the orchestrator, which `space.send`s the reply to the person.

## Stack

- **Bun** + Spectrum iMessage (`@spectrum-ts/core`, `@spectrum-ts/imessage`)
- **Vercel AI SDK** (`ai`, `@ai-sdk/openai`)
- **GMI Cloud** OpenAI-compatible inference (`GMI_CLOUD_API_KEY`)

## Setup

```bash
bun install
```

Add to `.env` (do not commit secrets):

```bash
GMI_CLOUD_API_KEY=
# optional override; default moonshotai/kimi-k2.7-code-highspeed
# GMI_MODEL=

SPECTRUM_PROJECT_ID=
SPECTRUM_PROJECT_SECRET=
SPECTRUM_SIGNING_WEBHOOK=

# optional
# ORCHESTRATOR_DEBOUNCE_MS=1500
# AGENT_PORT=4001
# BASE_URL=https://agent.alhwyn.com
```

## Run

```bash
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

Layout lives under `src/orchestrator/` (types / utils / agents / bounce / handoff / memory / prompts):

1. Person texts → keyed debounce (`src/orchestrator/bounce/inbound.ts`)
2. Interaction Agent runs (`src/orchestrator/agents/interaction.ts`) with tools `assign_task` + `reply_to_user`
3. Worker runs stubs (`echo`, `search_mock`) in `src/orchestrator/agents/execution.ts`
4. Handoff bus notifies the orchestrator (`src/orchestrator/handoff/bus.ts`)
5. Orchestrator `reply_to_user` → `space.send` to the person

Workers never message the user directly.

### Smoke test

Text something like: “search for weekend plans and tell me”.

Expect: short ack (optional) → sub-agent completion → final iMessage with mock search results.
