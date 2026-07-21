# openai-imessage

**Repo:** [https://github.com/Alhwyn/openai-imessage](https://github.com/Alhwyn/openai-imessage)

iMessage orchestrator that debounces inbound messages, routes work through an Interaction Agent, and delivers replies back to the conversation.

Conversation history and curated memory persist in [Convex](https://convex.dev). Connected accounts (Gmail, Calendar, and other approved apps) go through Composio. Browser and desktop GUI work runs on a local Linux computer-use runtime powered by GPT-5.6.

## Codex & GPT-5.6

### Codex (how the project was built)

[OpenAI Codex](https://openai.com/codex) was the primary coding agent for this repo. It was used to:

- Scaffold and iterate the Bun orchestrator, inbound debounce, and iMessage delivery path
- Wire the Interaction / Execution agents through the Vercel AI SDK + OpenAI Responses API
- Build the local Linux computer-use worker (Docker desktop, screenshot loop, action execution, live viewer, recordings)
- Add Convex persistence for history/memory and the durable computer-run state machine
- Harden prompts, tool schemas, tests, and plain-text iMessage delivery constraints

### GPT-5.6 (how the product runs)

All text and computer-control inference goes through GMI Cloud’s OpenAI-compatible `/v1/responses` endpoint (`GMI_CLOUD_API_KEY`). Model IDs in code:

| Model | Constant | Used for |
| --- | --- | --- |
| `openai/gpt-5.6-luna` | `DEFAULT_MODEL` / `MODEL_ID` in `src/orchestrator/utils/constants/gmi.ts` | Interaction Agent (chat + tool routing) and Execution Agent (background tasks) via `generateText` |
| `openai/gpt-5.6-terra` | `COMPUTER_MODEL` in `src/orchestrator/computer/constants.ts` | Computer-use loop: screenshots in → mouse/keyboard `computer` tool actions out (`src/orchestrator/computer/openai.ts`) |

**Luna path:** inbound iMessage → Interaction Agent chooses tools (`assign_task`, `assign_computer_task`, Composio Gmail/Calendar, maps, images, etc.) → optional Execution Agent for longer work → plain-text reply. Reasoning effort is forced on (GMI’s prefixed model id) with `effort: none` for low-latency tool turns.

**Terra path:** `assign_computer_task` starts a durable Convex run, records the XFCE desktop, and loops GPT-5.6 Terra with the Responses `computer` tool until the goal is verified visually or the step budget ends. Results land in the token-gated viewer and as an iMessage card.

Image generation uses Seedream (`seedream-5.0-lite`) on GMI, not GPT-5.6.

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

### Prerequisites

- [Bun](https://bun.sh) (runtime + package manager)
- [Docker](https://www.docker.com/) (only if you want computer-use)
- A [Spectrum](https://spectrum.im) project for iMessage
- A [GMI Cloud](https://gmicloud.ai) API key (GPT-5.6 Luna/Terra + images)
- A [Convex](https://convex.dev) account

Optional: [Composio](https://composio.dev) CLI, [Exa](https://exa.ai), Google Maps, [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) for tunnels.

### 1. Install

```bash
bun install
cp .env.example .env
```

Fill `.env` from the tables below. Never commit `.env`. Authoritative names live only in `.env.example`.

### 2. Environment variables

#### Required to boot the orchestrator

| Variable | What it is |
| --- | --- |
| `SPECTRUM_PROJECT_ID` | Spectrum project id |
| `SPECTRUM_PROJECT_SECRET` | Spectrum project secret |
| `GMI_CLOUD_API_KEY` | GMI inference key (Luna chat/workers, Terra computer-use, Seedream images) |
| `CONVEX_URL` | Convex deployment URL (written by `bun run convex:dev`, also copy into `.env`) |
| `ORCHESTRATOR_BRIDGE_SECRET` | Shared secret between Bun and Convex; must match on both sides |

#### Spectrum / phone

| Variable | Required? | What it is |
| --- | --- | --- |
| `PHONE_NUMBER` | Optional | Local phone / identity note for your Spectrum setup |
| `SPECTRUM_SIGNING_WEBHOOK` | Optional | Webhook signing secret when Spectrum posts to your tunnel |

#### Connected apps (Composio)

| Variable | Required? | What it is |
| --- | --- | --- |
| `COMPOSIO_API_KEY` | For Gmail/Calendar tools | From `composio login` / dashboard |
| `COMPOSIO_USER_ID_SALT` | With Composio | Random salt; Spectrum sender ids are hashed with this before becoming Composio user ids |

```bash
composio login
composio init
# then put COMPOSIO_API_KEY + COMPOSIO_USER_ID_SALT in .env
```

#### Computer use (Docker desktop)

| Variable | Required? | What it is |
| --- | --- | --- |
| `COMPUTER_DESKTOP_PASSWORD` | To start the desktop | Passed to Kasm as `VNC_PW` (`bun run computer:up` fails without it) |
| `COMPUTER_LIVE_VIEW_URL` | For iMessage live cards | Public HTTPS URL for the desktop stream, e.g. `https://desktop.example.com` (viewer host is derived as `viewer.*`) |
| `OPENAI_API_KEY` | Optional / reserved | Listed in `.env.example`; runtime chat + computer-use currently go through `GMI_CLOUD_API_KEY` |

#### Research + maps

| Variable | Required? | What it is |
| --- | --- | --- |
| `EXA_API_KEY` | For web search tools | [Exa](https://exa.ai) API key |
| `GOOGLE_MAPS_API_KEY` | For maps / geocode | Google Maps Platform key |
| `MAPS_PUBLIC_BASE_URL` | For shareable map cards | Public base URL for the maps viewer |
| `MAPS_VIEWER_TOKEN_SECRET` | With maps | Secret used to sign token-gated map viewer links |

### 3. Convex

```bash
# Terminal A — links a deployment, syncs schema/functions, writes CONVEX_URL
bun run convex:dev
```

Put the same bridge secret in local `.env` and on the Convex deployment:

```bash
# .env
CONVEX_URL=https://….convex.cloud
ORCHESTRATOR_BRIDGE_SECRET=some-long-random-string

# Convex deployment (same value)
bunx convex env set ORCHESTRATOR_BRIDGE_SECRET some-long-random-string
```

Keep `bun run convex:dev` running while you develop so functions stay synced.

### 4. Minimal `.env` checklist

```bash
# required
SPECTRUM_PROJECT_ID=...
SPECTRUM_PROJECT_SECRET=...
GMI_CLOUD_API_KEY=...
CONVEX_URL=https://….convex.cloud
ORCHESTRATOR_BRIDGE_SECRET=...

# optional features
SPECTRUM_SIGNING_WEBHOOK=
COMPOSIO_API_KEY=
COMPOSIO_USER_ID_SALT=
COMPUTER_DESKTOP_PASSWORD=
COMPUTER_LIVE_VIEW_URL=
EXA_API_KEY=
GOOGLE_MAPS_API_KEY=
MAPS_PUBLIC_BASE_URL=
MAPS_VIEWER_TOKEN_SECRET=
```

## Run

```bash
# Terminal 1 — Convex
bun run convex:dev

# Terminal 2 — orchestrator (Bun loads .env automatically)
bun run start
```

Text an inbound message to the Spectrum iMessage line. Flow: debounce → Interaction Agent (GPT-5.6 Luna) → tools/workers → reply.

### Computer use

Computer-use drives a full XFCE desktop over X11 (screenshots + `xdotool`), not DOM automation. Docker is the local boundary.

1. Set `GMI_CLOUD_API_KEY` and `COMPUTER_DESKTOP_PASSWORD` in `.env`.
2. Start the desktop:

```bash
bun run computer:up
```

3. Open `https://127.0.0.1:6901` and accept the local certificate. Loopback basic auth is disabled; the password is still required by the Kasm image at startup. Display is locked to **1280×800** for stable model coordinates.

When `assign_computer_task` runs, the orchestrator:

1. Creates a durable run in Convex
2. Records the session with FFmpeg (still captures pause the recorder so X11 is not dual-grabbed)
3. Sends screenshots to GPT-5.6 Terra and applies returned mouse/keyboard actions
4. Writes `runtime/computer/artifacts/<taskId>/demo.mp4`
5. Serves a token-gated viewer at `http://127.0.0.1:6902` (live timeline + replay)

```bash
bun run computer:logs
bun run computer:down
```

If the desktop X session dies:

```bash
bun run computer:down && bun run computer:up
```

### Dev tunnel (optional)

Expose localhost over HTTPS for Spectrum webhooks and computer/map cards:

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

Point Spectrum’s webhook at the `agent.*` URL and set `SPECTRUM_SIGNING_WEBHOOK` if your project uses signed webhooks. Set `COMPUTER_LIVE_VIEW_URL` to the public `desktop.*` URL so iMessage cards open the live stream.

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
