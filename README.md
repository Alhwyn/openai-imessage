# openai-imessage

Bouncer-style iMessage orchestrator: inbound messages are debounced, an Interaction Agent may `assign_task` to an Execution Agent, and when the worker finishes it **notifies** the orchestrator, which `space.send`s the reply to the person.

Conversation history and Hermes-style curated memory (`USER.md` / `MEMORY.md`) persist in **Convex**.

## Stack

- **Bun** + Spectrum iMessage (`@spectrum-ts/core`, `@spectrum-ts/imessage`)
- **Vercel AI SDK** (`ai`, `@ai-sdk/openai`)
- **OpenAI** — text agents, image generation, and computer use (`OPENAI_API_KEY`)
- **Convex** — durable messages + curated memory (`CONVEX_URL`)
- **Composio** — per-person OAuth connections for Gmail, Google Calendar, and other approved apps
- **Computer use** — a local KasmVNC/XFCE Linux desktop controlled through OpenAI's screenshot-and-action loop

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

Use only the variable names declared in `.env.example`. Convex manages its
required `CONVEX_URL` in `.env.local` when you run `bun run convex:dev`.

## Run

```bash
# Terminal 1 — Convex
bun run convex:dev

# Terminal 2 — orchestrator
bun run start
```

### Local Linux computer

Computer-use tasks operate a complete XFCE Linux desktop through its X11 mouse
and keyboard. The model does not use DOM selectors or Playwright. Docker is a
local development boundary; production tasks should receive separate VMs.

Add `OPENAI_API_KEY` and `COMPUTER_DESKTOP_PASSWORD` to your local `.env`
yourself, then start the desktop:

```bash
bun run computer:up
```

Open `https://127.0.0.1:6901` and accept the local certificate. Basic auth is
disabled on the loopback-only Kasm endpoint; `COMPUTER_DESKTOP_PASSWORD` is
still required by the base image during startup. The fixed desktop resolution
is 1280×800 so model coordinates remain stable.

Then run Convex and the orchestrator normally. When the interaction agent calls
`assign_computer_task`, it:

1. Creates a durable run in Convex.
2. Records the desktop with FFmpeg.
3. Sends screenshots to OpenAI only after model action batches.
4. Executes returned mouse and keyboard actions through `xdotool`.
5. Saves the final MP4 under `runtime/computer/artifacts/<taskId>/demo.mp4`.
6. Serves a custom viewer on `http://127.0.0.1:6902` with a live action
   timeline, coordinate highlights, and completed-session replay.

Useful commands:

```bash
bun run computer:logs
bun run computer:down
```

Set a public desktop tunnel for live-view cards:

```bash
COMPUTER_LIVE_VIEW_URL=https://desktop.alhwyn.com
```

That single URL is the source of truth. A `desktop.*` URL is used for the Kasm
stream and derives the matching token-gated `viewer.*` page.

### Dev tunnel (optional, like ngrok)

Expose localhost to a stable HTTPS hostname for webhook testing (same Cloudflare tunnel as bouncer):

```bash
# Terminal 1 — app on :4001
bun run start

# Terminal 2 — one-off random URL
bun run tunnel:quick

# Or named tunnel (first time)
bun run tunnel:setup
bun run tunnel
```

`bun run tunnel` starts the webhook tunnel plus the computer tunnel:

- `viewer.alhwyn.com` → token-gated viewer on `127.0.0.1:6902`
- `desktop.alhwyn.com` → Kasm stream on `127.0.0.1:6901`
- `agent.alhwyn.com` → webhook server on `127.0.0.1:4001`

Set `COMPUTER_LIVE_VIEW_URL=https://desktop.alhwyn.com` for computer cards.

## How orchestration works

Layout lives under `src/orchestrator/` (types / utils / agents / bounce / handoff / **db** / **memory** / prompts):

1. Person texts → keyed debounce (`src/orchestrator/bounce/inbound.ts`)
2. Interaction Agent loads curated memory, recent conversation history, and optional connected-app tools, then runs with first-party tools such as `assign_task`, `assign_image_task`, `assign_computer_task`, `react_to_message`, and `memory`
3. Workers run generic tasks or operate the local Linux desktop for computer-use tasks
4. Handoff delivers worker output to the captured conversation target
5. Turn transcripts append atomically in Convex; memory edits use their own mutation

`db/` is the only module that talks to Convex; `memory/` calls `db` functions.

### Composio connected apps

The agent caches one Composio Tool Router tool set per sender and toolkit configuration.
Connections are isolated by sender: the raw Spectrum sender ID is salted and hashed
before it becomes the Composio user ID. If Spectrum does not provide a sender ID,
connected-app tools stay disabled for that message. By default, only Gmail and Google Calendar
are enabled.

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
