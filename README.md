# openai-imessage

iMessage orchestrator that debounces inbound messages, routes work through an Interaction Agent, and delivers replies back to the conversation.

Conversation history and curated memory persist in [Convex](https://convex.dev). Connected accounts (Gmail, Calendar, and other approved apps) go through Composio. Browser and desktop GUI work runs on a local Linux computer-use runtime.

## Stack

| Layer | Role |
| --- | --- |
| Bun + Spectrum iMessage | Runtime and messaging transport |
| Vercel AI SDK | Agent tool loops |
| GMI Cloud | Text, images, and computer-use model calls (`GMI_CLOUD_API_KEY`) |
| Convex | Durable messages and memory (`CONVEX_URL`) |
| Composio | Per-person OAuth for connected apps |
| Docker + KasmVNC/XFCE | Local Linux desktop for computer-use tasks |

## Setup

```bash
bun install
```

Environment variables are defined only in `.env.example`. Copy the names you need into a local `.env` (never commit secrets). Convex writes `CONVEX_URL` to `.env.local` when you run `bun run convex:dev`.

### Convex

```bash
# Terminal A — links a deployment, syncs schema/functions
bun run convex:dev
```

Add the bridge secret to `.env`:

```bash
CONVEX_URL=https://….convex.cloud
ORCHESTRATOR_BRIDGE_SECRET=some-long-random-string
```

Mirror it on the Convex deployment:

```bash
bunx convex env set ORCHESTRATOR_BRIDGE_SECRET some-long-random-string
```

Keep `bun run convex:dev` running during development so functions stay synced.

### Composio (optional)

```bash
composio login
composio init
```

Add `COMPOSIO_API_KEY` (and `COMPOSIO_USER_ID_SALT`) from that setup to `.env`.

## Run

```bash
# Terminal 1 — Convex
bun run convex:dev

# Terminal 2 — orchestrator
bun run start
```

### Computer use

Computer-use tasks drive a full XFCE desktop over X11 (screenshots + `xdotool`), not DOM automation. Docker is the local boundary; production should use dedicated VMs.

1. Set `GMI_CLOUD_API_KEY` and `COMPUTER_DESKTOP_PASSWORD` in `.env`.
2. Start the desktop:

```bash
bun run computer:up
```

3. Open `https://127.0.0.1:6901` and accept the local certificate. Loopback basic auth is disabled; the password is still required by the Kasm image at startup. Display size is locked to **1280×800** for stable model coordinates.

When `assign_computer_task` runs, the orchestrator:

1. Creates a durable run in Convex
2. Records the session with FFmpeg (still captures pause the recorder so X11 is not dual-grabbed)
3. Sends screenshots to the model and applies returned mouse/keyboard actions
4. Writes `runtime/computer/artifacts/<taskId>/demo.mp4`
5. Serves a token-gated viewer at `http://127.0.0.1:6902` (live timeline + replay)

```bash
bun run computer:logs
bun run computer:down
```

If the desktop X session dies, recreate it:

```bash
bun run computer:down && bun run computer:up
```

For live-view cards, set:

```bash
COMPUTER_LIVE_VIEW_URL=https://desktop.example.com
```

A `desktop.*` host is used for the Kasm stream; the matching `viewer.*` host is derived for the token-gated page.

### Dev tunnel (optional)

Expose localhost over HTTPS for webhooks and computer cards:

```bash
bun run tunnel:quick          # one-off URL → :4001
bun run tunnel:setup && bun run tunnel   # named tunnel
```

`bun run tunnel` typically maps:

| Host | Target |
| --- | --- |
| `agent.*` | webhook (`127.0.0.1:4001`) |
| `desktop.*` | Kasm (`127.0.0.1:6901`) |
| `viewer.*` | computer viewer (`127.0.0.1:6902`) |

## Architecture

Code lives under `src/orchestrator/`:

1. Inbound text → keyed debounce (`bounce/inbound.ts`)
2. Interaction Agent loads memory, recent history, and tools (`assign_task`, `assign_image_task`, `assign_computer_task`, connected-app tools, and similar)
3. Workers handle generic tasks, image generation, or the Linux desktop
4. Handoff delivers results to the original conversation
5. Transcripts and memory updates persist in Convex

`db/` is the only Convex client surface; `memory/` calls into `db`.

### Connected apps

Composio tools are cached per sender. The Spectrum sender ID is salted and hashed before becoming the Composio user ID. Without a sender ID, connected-app tools stay off. Default toolkits are Gmail and Google Calendar.

For an unconnected service, the agent texts an OAuth URL. The person finishes OAuth in the browser, then retries the request. Credentials are never collected over iMessage.

## Smoke checks

1. “Search for weekend plans and tell me” — ack → worker → reply.
2. “Call me Al from now on” — memory write; restart the app and confirm the name sticks.
3. Multi-turn chat survives process restart (history in Convex).
4. “Open Chrome and go to example.com” — computer card + live viewer; desktop stays healthy through the run.
