<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Cursor Cloud specific instructions

Runtime is **Bun** (see `CLAUDE.md`); npm/node/vite are not used. Bun is installed at
`~/.bun/bin` and added to PATH via `~/.bashrc`. Standard scripts live in `package.json`
(`start`, `convex:dev`, `check`, `test`, `lint`, `typecheck`, `build`); setup/run steps are
in `README.md`. `bun run check` (lint + typecheck + `bun test` + build) runs fully offline and
mirrors CI — all tests are unit tests needing no running services.

Two local services matter for development:

- **Convex** (required backend for conversation history + curated memory). Run it with
  `CONVEX_AGENT_MODE=anonymous bunx convex dev` (or `... bun run convex:dev`). Anonymous agent
  mode avoids interactive login and provisions a **local** backend at `http://127.0.0.1:3210`,
  writing `CONVEX_URL`/`CONVEX_DEPLOYMENT`/`CONVEX_SITE_URL` to `.env.local` (Bun auto-loads it).
  Keep it running while developing so schema/functions stay synced.
- **Orchestrator app**: `bun run start` (`bun --watch index.ts`), webhook listener on `AGENT_PORT`
  (default `4001`).

Non-obvious gotchas:

- `ORCHESTRATOR_BRIDGE_SECRET` is a shared secret that must be set in **two places with the same
  value**: the app process env AND the Convex deployment (`bunx convex env set
  ORCHESTRATOR_BRIDGE_SECRET <value>`). Convex functions reject calls whose `secret` arg does not
  match, so a mismatch surfaces as `Unauthorized`.
- Startup order in `index.ts` asserts env in this order: GMI key → Convex (`CONVEX_URL` +
  `ORCHESTRATOR_BRIDGE_SECRET`) → Spectrum. The app hard-fails at boot if any are missing.
- Fully booting the app requires **external SaaS credentials that cannot be self-provisioned**:
  `GMI_CLOUD_API_KEY` (LLM/image inference) and `SPECTRUM_PROJECT_ID`/`SPECTRUM_PROJECT_SECRET`
  (+ `SPECTRUM_SIGNING_WEBHOOK` for webhooks). Without Spectrum creds the app boots up to the
  Spectrum gate and stops. Composio (`COMPOSIO_API_KEY`) is optional and cleanly disabled when unset.
- To exercise the backend directly without the app, call functions via
  `bunx convex run messages:listRecent '{"secret":"<secret>","spaceId":"...","limit":10}'` (and
  `messages:appendMany`, `memories:applyEdit`, `memories:getForSpace`).
- Live webhook testing needs a public URL via the Cloudflare tunnel scripts (`bun run tunnel:quick`);
  `cloudflared` is not preinstalled.
