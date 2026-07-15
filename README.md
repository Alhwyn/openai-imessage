# openai-imessage

To install dependencies:

```bash
bun install
```

To run:

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

# If DNS/ingress is wrong
bun run tunnel:fix
```

Defaults: tunnel `webhook-automator` → `agent.alhwyn.com` → `127.0.0.1:4001`.

Set `BASE_URL=https://agent.alhwyn.com` in `.env` when testing webhooks.

This project was created using `bun init` in bun v1.3.13. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
